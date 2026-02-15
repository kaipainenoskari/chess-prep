import { normalizeFenForLookup, applyMoveUci } from "@/lib/fen";
import { getOpponentMoveDistribution } from "@/lib/opponent/moveProbability";
import type { OpponentProfile } from "@/lib/opponent/moveProbability";
import { getHumanMoves } from "@/lib/lichess/getHumanMoves";
import { analyzePosition } from "@/lib/engine/analyzePosition";
import type { LineEngineMove, LineHumanMove } from "@/lib/analysis/metrics";
import { isTrapNode, type TrapNodeResult } from "./trapDetection";
import {
  LINE_ANALYSIS_DEPTH,
  LINE_ANALYSIS_MULTIPV,
  MAX_TRAP_DEPTH,
  TRAP_EXPANSION_MIN_OPPONENT_PROB,
  TRAP_EXPANSION_MIN_LICHESS_PROB,
  TRAP_EXPANSION_MIN_ENTRY_PROB,
  TRAP_MIN_HALFMOVES_BEFORE_TERMINAL,
  PREPARER_CANDIDATES_PER_NODE,
  PREPARER_MAX_EVAL_GAP_CP,
} from "@/lib/config";

const LOG_TRAP_EXPANSION =
  process.env.LOG_TRAP_PIPELINE === "1" || process.env.DEBUG?.includes("trap");

function log(msg: string, data?: object) {
  if (LOG_TRAP_EXPANSION) {
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    console.error(`[TrapPipeline] ${msg}${payload}`);
  }
}

/** Metrics at the critical (trap) node when criticalIndex is set. */
export type TrapLineMetrics = TrapNodeResult["metrics"];

/** A line produced by trap-oriented expansion (terminates at trap or depth cap). */
export interface TrapLine {
  lineMoves: string[];
  lineEngine: LineEngineMove[];
  lineHuman: LineHumanMove[];
  opponentProbabilityPerStep: number[];
  opponentDistributionsPerStep: Array<{ move: string; probability: number }[]>;
  entryProbability: number;
  /** Half-move index where the trap was detected; null if line ended without trap. */
  criticalIndex: number | null;
  /** Trap metrics at the critical node (when criticalIndex !== null). */
  trapMetrics: TrapLineMetrics | null;
}

export interface ExpandTrapOrientedParams {
  rootFen: string;
  initialMove: string;
  preparerColor: "white" | "black";
  opponentProfile: OpponentProfile;
}

function sideToMove(fen: string): "w" | "b" {
  const parts = fen.trim().split(/\s+/);
  return parts[1]?.toLowerCase() === "b" ? "b" : "w";
}

function isOpponentTurn(fen: string, preparerColor: "white" | "black"): boolean {
  const side = sideToMove(fen);
  return (
    (side === "b" && preparerColor === "white") ||
    (side === "w" && preparerColor === "black")
  );
}

function moveMatches(a: string, b: string): boolean {
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

function terminalLine(
  lineMoves: string[],
  lineEngine: LineEngineMove[],
  lineHuman: LineHumanMove[],
  opponentProbs: number[],
  opponentDistributionsSoFar: Array<{ move: string; probability: number }[]>,
  criticalIndex: number | null,
  trapMetrics: TrapLineMetrics | null,
): TrapLine {
  const entryProbability =
    opponentProbs.length > 0 ? opponentProbs.reduce((p, q) => p * q, 1) : 1;
  return {
    lineMoves: [...lineMoves],
    lineEngine: [...lineEngine],
    lineHuman: [...lineHuman],
    opponentProbabilityPerStep: [...opponentProbs],
    opponentDistributionsPerStep: [...opponentDistributionsSoFar],
    entryProbability,
    criticalIndex,
    trapMetrics,
  };
}

interface ExpandStepOptions {
  preparerColor: "white" | "black";
  opponentProfile: OpponentProfile;
}

async function expandStep(
  currentFen: string,
  depthLeft: number,
  initialMove: string | null,
  isFirstStep: boolean,
  lineMoves: string[],
  lineEngine: LineEngineMove[],
  lineHuman: LineHumanMove[],
  opponentProbs: number[],
  opponentDistributionsSoFar: Array<{ move: string; probability: number }[]>,
  options: ExpandStepOptions,
): Promise<TrapLine[]> {
  const entryProbability =
    opponentProbs.length > 0 ? opponentProbs.reduce((p, q) => p * q, 1) : 1;
  const fenNorm = normalizeFenForLookup(currentFen);
  const opponentTurn = isOpponentTurn(fenNorm, options.preparerColor);

  log("expandStep", {
    depthLeft,
    fenSnippet: fenNorm.slice(0, 30),
    entryProbability,
    opponentTurn,
    lineMovesLen: lineMoves.length,
  });

  if (depthLeft <= 0) {
    log("terminate depth", { depthLeft });
    return [
      terminalLine(
        lineMoves,
        lineEngine,
        lineHuman,
        opponentProbs,
        opponentDistributionsSoFar,
        null,
        null,
      ),
    ];
  }

  if (entryProbability < TRAP_EXPANSION_MIN_ENTRY_PROB) {
    log("prune entryProbability", {
      entryProbability,
      min: TRAP_EXPANSION_MIN_ENTRY_PROB,
    });
    return [];
  }

  if (opponentTurn) {
    const [distResult, engineResult, humanResult] = await Promise.all([
      getOpponentMoveDistribution(fenNorm, options.opponentProfile),
      analyzePosition(fenNorm, LINE_ANALYSIS_DEPTH, LINE_ANALYSIS_MULTIPV),
      getHumanMoves(fenNorm, options.opponentProfile.ratingBucket),
    ]);
    const dist = distResult.moves;

    const trapResult = isTrapNode({
      engineResult,
      moveDistribution: dist,
      entryProbability,
    });

    if (trapResult.isTrap && lineMoves.length >= TRAP_MIN_HALFMOVES_BEFORE_TERMINAL) {
      const criticalIndex = lineMoves.length;
      log("trap detected", {
        criticalIndex,
        lineMoves: lineMoves.slice(-3),
        metrics: trapResult.metrics,
      });
      return [
        terminalLine(
          lineMoves,
          lineEngine,
          lineHuman,
          opponentProbs,
          opponentDistributionsSoFar,
          criticalIndex,
          trapResult.metrics,
        ),
      ];
    }

    const lichessTotal = humanResult.moves.reduce((s, m) => s + m.games, 0);
    // Require Lichess data to expand opponent moves; otherwise we'd follow engine top move
    // (e.g. a6) even when only 2% of humans play it.
    if (lichessTotal === 0) {
      log("opponent no Lichess data", {
        fen: fenNorm.slice(0, 50),
        lineMoves: lineMoves.slice(-4),
        humanMovesLength: humanResult.moves.length,
      });
      return [
        terminalLine(
          lineMoves,
          lineEngine,
          lineHuman,
          opponentProbs,
          opponentDistributionsSoFar,
          null,
          null,
        ),
      ];
    }
    const lichessProb = (move: string): number => {
      const stat = humanResult.moves.find((m) => moveMatches(m.move, move));
      return (stat?.games ?? 0) / lichessTotal;
    };
    const allowed = dist.filter((m) => {
      if (m.probability < TRAP_EXPANSION_MIN_OPPONENT_PROB) return false;
      if (lichessProb(m.move) < TRAP_EXPANSION_MIN_LICHESS_PROB) return false;
      return true;
    });

    // Diagnostic: log Lichess response and dist so we can see API vs filter issues
    log("opponent node Lichess", {
      fenSnippet: fenNorm.slice(0, 50),
      lineMoves: lineMoves.slice(-4),
      humanMovesLength: humanResult.moves.length,
      lichessTotal,
      ratingBucket: options.opponentProfile.ratingBucket,
      humanMoveFormats: humanResult.moves.slice(0, 6).map((m) => m.move),
      distTop3: dist.slice(0, 3).map((m) => ({
        move: m.move,
        distProb: m.probability,
        lichessProb: lichessProb(m.move),
        passed: allowed.some((a) => moveMatches(a.move, m.move)),
      })),
    });

    if (allowed.length === 0) {
      log("opponent no allowed moves", {
        distLen: dist.length,
        lichessTotal,
        minLichessProb: TRAP_EXPANSION_MIN_LICHESS_PROB,
      });
      return [
        terminalLine(
          lineMoves,
          lineEngine,
          lineHuman,
          opponentProbs,
          opponentDistributionsSoFar,
          null,
          null,
        ),
      ];
    }

    // Opponent: only their most probable move (prep against what they're most likely to play)
    const mostProbable = allowed[0];
    const toExpand = mostProbable ? [mostProbable] : [];
    log("opponent expanding", {
      move: mostProbable?.move,
      distProbability: mostProbable?.probability,
      lichessProb: mostProbable ? lichessProb(mostProbable.move) : undefined,
      lineMoves: lineMoves.slice(-4),
    });

    const out: TrapLine[] = [];
    for (const { move: oppMove, probability } of toExpand) {
      const engineMove =
        engineResult.bestMoves.find((m) => moveMatches(m.move, oppMove)) ??
        engineResult.bestMoves[0];
      const eval_ = engineMove ? engineMove.eval : 0;
      const humanMove = humanResult.moves.find((m) => moveMatches(m.move, oppMove));

      const nextFen = applyMoveUci(fenNorm, oppMove);
      if (!nextFen) {
        log("applyMoveUci failed", { move: oppMove });
        continue;
      }

      const nextLines = await expandStep(
        nextFen,
        depthLeft - 1,
        null,
        false,
        [...lineMoves, oppMove],
        [...lineEngine, { move: oppMove, eval: eval_ }],
        [
          ...lineHuman,
          {
            move: oppMove,
            games: humanMove?.games ?? 0,
            winrate: humanMove?.winrate ?? 0,
          },
        ],
        [...opponentProbs, probability],
        [...opponentDistributionsSoFar, dist],
        options,
      );
      out.push(...nextLines);
    }
    return out;
  }

  // Preparer's turn: consider multiple candidate moves (top N within eval gap)
  const [engineResult, humanResult] = await Promise.all([
    analyzePosition(fenNorm, LINE_ANALYSIS_DEPTH, LINE_ANALYSIS_MULTIPV),
    getHumanMoves(fenNorm, options.opponentProfile.ratingBucket),
  ]);

  const bestMoves = engineResult.bestMoves ?? [];
  if (bestMoves.length === 0) {
    log("preparer no move");
    return [
      terminalLine(
        lineMoves,
        lineEngine,
        lineHuman,
        opponentProbs,
        opponentDistributionsSoFar,
        null,
        null,
      ),
    ];
  }

  let candidates: { move: string; eval: number }[];
  if (isFirstStep && initialMove) {
    const fixed = bestMoves.find((m) => moveMatches(m.move, initialMove)) ?? bestMoves[0];
    candidates = [fixed];
  } else {
    const bestEval = bestMoves[0].eval;
    const minEval = bestEval - PREPARER_MAX_EVAL_GAP_CP;
    candidates = bestMoves
      .filter((m) => m.eval >= minEval)
      .slice(0, PREPARER_CANDIDATES_PER_NODE);
  }

  log("preparer candidates", {
    count: candidates.length,
    moves: candidates.map((m) => ({ move: m.move, eval: m.eval })),
    isFirstStep,
  });

  const out: TrapLine[] = [];
  for (const moveToPlay of candidates) {
    const humanMove = humanResult.moves.find((m) => moveMatches(m.move, moveToPlay.move));
    const nextFen = applyMoveUci(fenNorm, moveToPlay.move);
    if (!nextFen) {
      log("preparer applyMoveUci failed", { move: moveToPlay.move });
      continue;
    }
    const nextLines = await expandStep(
      nextFen,
      depthLeft - 1,
      null,
      false,
      [...lineMoves, moveToPlay.move],
      [...lineEngine, { move: moveToPlay.move, eval: moveToPlay.eval }],
      [
        ...lineHuman,
        {
          move: moveToPlay.move,
          games: humanMove?.games ?? 0,
          winrate: humanMove?.winrate ?? 0,
        },
      ],
      opponentProbs,
      opponentDistributionsSoFar,
      options,
    );
    out.push(...nextLines);
  }

  if (out.length === 0) {
    return [
      terminalLine(
        lineMoves,
        lineEngine,
        lineHuman,
        opponentProbs,
        opponentDistributionsSoFar,
        null,
        null,
      ),
    ];
  }
  return out;
}

/**
 * Expand lines using trap-oriented algorithm: terminate at trap node or depth cap.
 * DFS: at each preparer node we consider up to PREPARER_CANDIDATES_PER_NODE moves within
 * PREPARER_MAX_EVAL_GAP_CP of best (root uses initialMove only); opponent moves filtered
 * by prob >= 0.1; prune when entryProbability < 0.02; stop when trap detected or depth > MAX_TRAP_DEPTH.
 */
export async function expandTrapOriented(
  params: ExpandTrapOrientedParams,
): Promise<TrapLine[]> {
  const { rootFen, initialMove, preparerColor, opponentProfile } = params;
  const fenNorm = normalizeFenForLookup(rootFen);

  log("expandTrapOriented start", {
    initialMove,
    preparerColor,
    maxDepth: MAX_TRAP_DEPTH,
  });

  const lines = await expandStep(
    fenNorm,
    MAX_TRAP_DEPTH,
    initialMove,
    true,
    [],
    [],
    [],
    [],
    [],
    { preparerColor, opponentProfile },
  );

  log("expandTrapOriented done", {
    linesCount: lines.length,
    withTrap: lines.filter((l) => l.criticalIndex !== null).length,
  });

  return lines;
}
