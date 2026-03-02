import { type Job } from "bullmq";
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
import { getHumanMoves } from "@/lib/lichess/getHumanMoves";
import { estimateLineAnalysisWork } from "@/lib/queue/estimateLineAnalysisWork";
import {
  LINE_ANALYSIS_DEPTH,
  LINE_ANALYSIS_MULTIPV,
  LINE_ANALYSIS_RATING_BUCKET,
  LINE_ANALYSIS_MIN_OPPONENT_ENTRY_PROBABILITY,
  PREP_EXPANSION_DEPTH,
  PREP_MAX_ROOT_CANDIDATES,
  PREPARER_TOP_HUMAN_MOVES,
  OPPONENT_MAX_BRANCHES,
  ESTIMATED_MS_PER_POSITION,
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
 * When job is provided, updates progress for UI progress bar.
 */
const ANALYSIS_STATUS_NO_TRAPS = "ANALYZED_NO_TRAPS";
const ANALYSIS_STATUS_WITH_TRAPS = "ANALYZED_WITH_TRAPS";

export async function processLineAnalysisJob(
  data: LineAnalysisJobData,
  job?: Job<LineAnalysisJobData, LineAnalysisJobResult> | null,
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
      const [childEngine, distResult, humanResult] = await Promise.all([
        analyzePosition(nextFen, LINE_ANALYSIS_DEPTH, LINE_ANALYSIS_MULTIPV),
        getOpponentMoveDistribution(nextFen, opponentProfile),
        getHumanMoves(nextFen, bucket).catch(() => ({
          moves: [] as { games: number; winrate: number }[],
        })),
      ]);
      let preparerWinRateAtChild: number | null = null;
      if (humanResult.moves.length > 0) {
        const total = humanResult.moves.reduce((s, m) => s + m.games, 0);
        if (total > 0) {
          const opponentAvgWinRate =
            humanResult.moves.reduce((s, m) => s + m.winrate * m.games, 0) / total;
          preparerWinRateAtChild = 1 - opponentAvgWinRate;
        }
      }
      return {
        engineResult: childEngine,
        opponentDistribution: distResult.moves,
        preparerWinRateAtChild,
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

  const cappedRoot = rootCandidates.slice(0, PREP_MAX_ROOT_CANDIDATES);
  const { estimatedPositions, estimatedTimeMs } = estimateLineAnalysisWork({
    rootCandidates: cappedRoot.length,
    depth: PREP_EXPANSION_DEPTH,
    preparerBranches: PREPARER_TOP_HUMAN_MOVES,
    opponentBranches: OPPONENT_MAX_BRANCHES,
    msPerPosition: ESTIMATED_MS_PER_POSITION,
  });

  if (job) {
    await job.updateProgress({
      current: 0,
      total: cappedRoot.length,
      estimatedPositions,
      estimatedTimeMs,
    });
  }

  const linesStored: string[] = [];

  if (USE_TRAP_PIPELINE) {
    for (let i = 0; i < cappedRoot.length; i++) {
      const candidate = cappedRoot[i];
      const trapLines = await expandTrapOriented({
        rootFen: rootFenNorm,
        initialMove: candidate.move,
        preparerColor,
        opponentProfile,
        maxDepth: PREP_EXPANSION_DEPTH,
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
      if (job) {
        await job.updateProgress({
          current: i + 1,
          total: cappedRoot.length,
          estimatedPositions,
          estimatedTimeMs,
        });
      }
    }
  } else {
    for (let i = 0; i < cappedRoot.length; i++) {
      const candidate = cappedRoot[i];
      const expandedLines = await expandRealisticLines(rootFenNorm, candidate.move, {
        depth: PREP_EXPANSION_DEPTH,
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
      if (job) {
        await job.updateProgress({
          current: i + 1,
          total: cappedRoot.length,
          estimatedPositions,
          estimatedTimeMs,
        });
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
