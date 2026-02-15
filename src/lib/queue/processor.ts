import { prisma } from "@/lib/prisma";
import { analyzePosition } from "@/lib/engine/analyzePosition";
import { expandRealisticLines } from "@/lib/analysis/expandRealisticLines";
import {
  computeLineDifficulty,
  computeOpponentBranchingFactor,
} from "@/lib/analysis/metrics";
import { selectRootCandidates } from "@/lib/traps/rootMoveSelection";
import { expandTrapOriented } from "@/lib/traps/expandTrapOriented";
import { getOpponentMoveDistribution } from "@/lib/opponent/moveProbability";
import {
  LINE_ANALYSIS_DEPTH,
  LINE_ANALYSIS_MULTIPV,
  LINE_ANALYSIS_LINE_DEPTH,
  LINE_ANALYSIS_RATING_BUCKET,
  LINE_ANALYSIS_MIN_OPPONENT_ENTRY_PROBABILITY,
} from "@/lib/config";
import { normalizeFenForLookup, applyMoveUci } from "@/lib/fen";

export interface LineAnalysisJobData {
  rootFen: string;
  projectId?: string;
}

export interface LineAnalysisJobResult {
  lineAnalysisId: string;
  linesStored: number;
}

const LOG_LINE_ANALYSIS =
  process.env.LOG_LINE_ANALYSIS === "1" || process.env.DEBUG?.includes("line");
const USE_TRAP_PIPELINE = process.env.USE_TRAP_PIPELINE === "true";

function log(msg: string, data?: object) {
  if (LOG_LINE_ANALYSIS) {
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    console.error(`[line-analysis] ${msg}${payload}`);
  }
}

/**
 * Job processor: analyze root FEN, expand realistic lines (opponent-constrained), compute difficulty, store.
 */
const ANALYSIS_STATUS_NO_TRAPS = "ANALYZED_NO_TRAPS";
const ANALYSIS_STATUS_WITH_TRAPS = "ANALYZED_WITH_TRAPS";

export async function processLineAnalysisJob(
  data: LineAnalysisJobData,
): Promise<LineAnalysisJobResult> {
  const { rootFen, projectId } = data;
  const ratingBucket = LINE_ANALYSIS_RATING_BUCKET;
  const rootFenNorm = normalizeFenForLookup(rootFen);
  log("jobStart", {
    rootFenCastlingField: rootFen.trim().split(/\s+/)[2],
    rootFenNormCastlingField: rootFenNorm.split(/\s+/)[2],
  });

  let preparerColor: "white" | "black" = "white";
  let bucket = ratingBucket;
  if (projectId) {
    const project = await (
      prisma as unknown as {
        prepProject: {
          findUnique: (args: {
            where: { id: string };
            select: { color: true; ratingBucket: true };
          }) => Promise<{ color: string; ratingBucket: string } | null>;
        };
      }
    ).prepProject.findUnique({
      where: { id: projectId },
      select: { color: true, ratingBucket: true },
    });
    if (project) {
      preparerColor = project.color === "black" ? "black" : "white";
      if (project.ratingBucket) bucket = project.ratingBucket;
    }
  }

  const opponentProfile = {
    projectId,
    ratingBucket: bucket,
    preparerColor,
  };

  const engineResult = await analyzePosition(
    rootFenNorm,
    LINE_ANALYSIS_DEPTH,
    LINE_ANALYSIS_MULTIPV,
  );

  const rootCandidates = await selectRootCandidates({
    engineResult,
    getChildPositionData: async (move) => {
      const nextFen = applyMoveUci(rootFenNorm, move);
      if (!nextFen) {
        return { engineResult: { bestMoves: [] }, opponentDistribution: [] };
      }
      const [childEngine, distResult] = await Promise.all([
        analyzePosition(nextFen, LINE_ANALYSIS_DEPTH, LINE_ANALYSIS_MULTIPV),
        getOpponentMoveDistribution(nextFen, opponentProfile),
      ]);
      return {
        engineResult: childEngine,
        opponentDistribution: distResult.moves,
      };
    },
  });

  if (LOG_LINE_ANALYSIS) {
    console.error(
      "[TrapPipeline] Selected root candidates:",
      rootCandidates.map((c) => ({
        move: c.move,
        eval: c.eval,
        marginCp: c.marginCp,
        rootScore: c.rootScore,
      })),
    );
  }
  log("rootTopMoves", { moves: rootCandidates.map((c) => c.move) });

  const linesStored: string[] = [];

  if (USE_TRAP_PIPELINE) {
    for (const candidate of rootCandidates) {
      const trapLines = await expandTrapOriented({
        rootFen: rootFenNorm,
        initialMove: candidate.move,
        preparerColor,
        opponentProfile,
      });
      for (const line of trapLines) {
        if (line.lineEngine.length === 0) continue;
        if (line.entryProbability < LINE_ANALYSIS_MIN_OPPONENT_ENTRY_PROBABILITY) {
          log("skipLowEntryProbability", {
            entryProbability: line.entryProbability,
            lineMoves: line.lineMoves.slice(0, 3),
          });
          continue;
        }
        const branchingFactor = computeOpponentBranchingFactor(
          line.opponentDistributionsPerStep,
        );
        const score = computeLineDifficulty(line.lineEngine, line.lineHuman, {
          opponentProbabilityProduct: line.entryProbability,
          opponentBranchingFactor: branchingFactor,
        });
        const record = await prisma.lineAnalysis.create({
          data: {
            rootFen,
            lineMoves: line.lineMoves as unknown as object,
            score,
            metricsJson: {
              lineEngine: line.lineEngine,
              lineHuman: line.lineHuman,
              entryProbability: line.entryProbability,
              opponentBranchingFactor: branchingFactor,
              criticalIndex: line.criticalIndex,
              trapMetrics: line.trapMetrics,
            } as object,
          },
        });
        linesStored.push(record.id);
      }
    }
  } else {
    for (const candidate of rootCandidates) {
      const expandedLines = await expandRealisticLines(rootFenNorm, candidate.move, {
        depth: LINE_ANALYSIS_LINE_DEPTH,
        preparerColor,
        opponentProfile,
      });

      for (const line of expandedLines) {
        if (line.lineEngine.length === 0) continue;
        if (line.entryProbability < LINE_ANALYSIS_MIN_OPPONENT_ENTRY_PROBABILITY) {
          log("skipLowEntryProbability", {
            entryProbability: line.entryProbability,
            lineMoves: line.lineMoves.slice(0, 3),
          });
          continue;
        }

        const branchingFactor = computeOpponentBranchingFactor(
          line.opponentDistributionsPerStep,
        );
        const score = computeLineDifficulty(line.lineEngine, line.lineHuman, {
          opponentProbabilityProduct: line.entryProbability,
          opponentBranchingFactor: branchingFactor,
        });
        const record = await prisma.lineAnalysis.create({
          data: {
            rootFen,
            lineMoves: line.lineMoves as unknown as object,
            score,
            metricsJson: {
              lineEngine: line.lineEngine,
              lineHuman: line.lineHuman,
              entryProbability: line.entryProbability,
              opponentBranchingFactor: branchingFactor,
            } as object,
          },
        });
        linesStored.push(record.id);
      }
    }
  }

  if (projectId) {
    const analysisStatus =
      linesStored.length > 0 ? ANALYSIS_STATUS_WITH_TRAPS : ANALYSIS_STATUS_NO_TRAPS;
    const normalizedRootFen = normalizeFenForLookup(rootFen);
    await (
      prisma as unknown as {
        openingTreeNode: {
          updateMany: (args: {
            where: { projectId: string; fen: string };
            data: {
              analysisStatus: string;
              trapCount: number;
              lastAnalyzedAt: Date | null;
              lastJobId: string | null;
            };
          }) => Promise<unknown>;
        };
      }
    ).openingTreeNode.updateMany({
      where: { projectId, fen: normalizedRootFen },
      data: {
        analysisStatus,
        trapCount: linesStored.length,
        lastAnalyzedAt: new Date(),
        lastJobId: null,
      },
    });
  }

  return {
    lineAnalysisId: linesStored[0] ?? "",
    linesStored: linesStored.length,
  };
}
