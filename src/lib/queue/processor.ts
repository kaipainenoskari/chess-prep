import { type Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { analyzePosition } from "@/lib/engine/analyzePosition";
import {
  expandRealisticLines,
  type ExpandedLine,
} from "@/lib/analysis/expandRealisticLines";
import { computePracticalLineScore } from "@/lib/analysis/metrics";
import { getHumanMoves } from "@/lib/lichess/getHumanMoves";
import { estimateLineAnalysisWork } from "@/lib/queue/estimateLineAnalysisWork";
import {
  LINE_ANALYSIS_DEPTH,
  LINE_ANALYSIS_MULTIPV,
  LINE_ANALYSIS_RATING_BUCKET,
  LINE_ANALYSIS_MIN_ENTRY_PROBABILITY,
  LINE_ANALYSIS_MIN_PRACTICAL_WIN_RATE,
  PREP_EXPANSION_MAX_DEPTH,
  ESTIMATED_MS_PER_POSITION,
  ESTIMATED_PREPARER_BRANCHES,
  ESTIMATED_OPPONENT_BRANCHES,
  PREP_MIN_POPULATION_GAMES,
} from "@/lib/config";
import { normalizeFenForLookup } from "@/lib/fen";

/** UI-configurable options for line analysis; all optional, config used when omitted. */
export interface LineAnalysisOptions {
  ratingBucket?: string;
  minEntryProbability?: number;
  minPracticalWinRate?: number;
  minOpponentProbabilityToExpand?: number;
}

export interface LineAnalysisJobData {
  rootFen: string;
  projectId?: string;
  options?: LineAnalysisOptions;
}

export interface LineAnalysisJobResult {
  lineAnalysisId: string;
  linesStored: number;
}

const LOG_LINE_ANALYSIS =
  process.env.LOG_LINE_ANALYSIS === "1" || process.env.DEBUG?.includes("line");

function log(msg: string, data?: object) {
  if (LOG_LINE_ANALYSIS) {
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    console.error(`[line-analysis] ${msg}${payload}`);
  }
}

/**
 * Job processor: analyze root FEN, expand realistic lines (opponent by probability, Lichess fallback), store.
 */
export async function processLineAnalysisJob(
  data: LineAnalysisJobData,
  job?: Job<LineAnalysisJobData, LineAnalysisJobResult> | null,
): Promise<LineAnalysisJobResult> {
  const { rootFen, options: jobOptions } = data;
  const ratingBucket = jobOptions?.ratingBucket ?? LINE_ANALYSIS_RATING_BUCKET;
  const minEntryProbability =
    jobOptions?.minEntryProbability ?? LINE_ANALYSIS_MIN_ENTRY_PROBABILITY;
  const minPracticalWinRate =
    jobOptions?.minPracticalWinRate ?? LINE_ANALYSIS_MIN_PRACTICAL_WIN_RATE;
  const minOpponentProbabilityToExpand =
    jobOptions?.minOpponentProbabilityToExpand ?? undefined;

  const rootFenNorm = normalizeFenForLookup(rootFen);
  const preparerColor: "white" | "black" = "white";
  log("jobStart", {
    rootFenCastlingField: rootFen.trim().split(/\s+/)[2],
    rootFenNormCastlingField: rootFenNorm.split(/\s+/)[2],
  });

  const opponentProfile = {
    ratingBucket,
    preparerColor,
  };

  const engineResult = await analyzePosition(
    rootFenNorm,
    LINE_ANALYSIS_DEPTH,
    LINE_ANALYSIS_MULTIPV,
  );

  // Root candidates: practically best moves by human win rate (population),
  // with engine best-move fallback when no human data exists.
  let rootCandidates: { move: string }[] = [];
  try {
    const humanRoot = await getHumanMoves(rootFenNorm, ratingBucket);
    if (humanRoot.moves.length > 0) {
      const withGames = humanRoot.moves.filter(
        (m) => m.games >= PREP_MIN_POPULATION_GAMES,
      );
      const source = withGames.length > 0 ? withGames : humanRoot.moves;
      const sorted = [...source].sort((a, b) => {
        if (b.winrate !== a.winrate) return b.winrate - a.winrate;
        return b.games - a.games;
      });
      rootCandidates = sorted.map((m) => ({ move: m.move }));
    }
  } catch {
    // If Lichess/local move service fails, fall back to engine-only selection below.
  }

  if (rootCandidates.length === 0) {
    const moves = engineResult.bestMoves ?? [];
    rootCandidates = moves.map((m) => ({ move: m.move }));
  }

  log("rootTopMoves", { moves: rootCandidates.map((c) => c.move) });

  const { estimatedPositions, estimatedTimeMs } = estimateLineAnalysisWork({
    rootCandidates: rootCandidates.length,
    depth: PREP_EXPANSION_MAX_DEPTH,
    preparerBranches: ESTIMATED_PREPARER_BRANCHES,
    opponentBranches: ESTIMATED_OPPONENT_BRANCHES,
    msPerPosition: ESTIMATED_MS_PER_POSITION,
  });

  if (job) {
    await job.updateProgress({
      current: 0,
      total: rootCandidates.length,
      estimatedPositions,
      estimatedTimeMs,
    });
  }

  const allLines: Array<{ line: ExpandedLine; score: number }> = [];

  for (let i = 0; i < rootCandidates.length; i++) {
    const candidate = rootCandidates[i];
    const expandedLines = await expandRealisticLines(rootFenNorm, candidate.move, {
      maxDepth: PREP_EXPANSION_MAX_DEPTH,
      preparerColor,
      opponentProfile,
      minEntryProbability,
      minPracticalWinRate,
      minOpponentProbability: minOpponentProbabilityToExpand,
    });

    for (const line of expandedLines) {
      if (line.lineEngine.length === 0) continue;
      const score = computePracticalLineScore(
        line.lineHuman,
        line.entryProbability,
        preparerColor,
      );
      allLines.push({ line, score });
    }
    if (job) {
      await job.updateProgress({
        current: i + 1,
        total: rootCandidates.length,
        estimatedPositions,
        estimatedTimeMs,
      });
    }
  }

  allLines.sort((a, b) => b.score - a.score);

  const lineKey = (moves: string[]) => moves.join(" ").toLowerCase();
  const seenKeys = new Set<string>();
  const topLines = allLines.filter(({ line }) => {
    const key = lineKey(line.lineMoves);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  await prisma.lineAnalysis.deleteMany({ where: { rootFen } });

  const linesStored: string[] = [];
  for (const { line, score } of topLines) {
    const record = await prisma.lineAnalysis.create({
      data: {
        rootFen,
        lineMoves: line.lineMoves as unknown as object,
        score,
        metricsJson: {
          lineEngine: line.lineEngine,
          lineHuman: line.lineHuman,
          entryProbability: line.entryProbability,
        } as object,
      },
    });
    linesStored.push(record.id);
  }

  return {
    lineAnalysisId: linesStored[0] ?? "",
    linesStored: linesStored.length,
  };
}
