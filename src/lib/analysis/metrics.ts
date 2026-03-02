import {
  OPPONENT_MIN_MOVE_PROBABILITY,
  LINE_SCORE_WEIGHT_OPPONENT_PROBABILITY,
  LINE_SCORE_WEIGHT_BRANCHING,
} from "@/lib/config";

/**
 * Pure difficulty metrics for candidate lines.
 * No I/O — easy to test and iterate.
 */

/** Per-move engine data in a line. */
export interface LineEngineMove {
  move: string;
  eval: number;
}

/** Per-move human stats in a line. */
export interface LineHumanMove {
  move: string;
  games: number;
  winrate: number;
}

/** Engine result with at least bestMoves[0] and optional bestMoves[1]. */
export interface EngineResultForMargin {
  bestMoves: Array<{ move: string; eval: number }>;
}

/**
 * Eval margin between best and second-best move (centipawns).
 * Positive = second move is worse. Zero if only one move.
 */
export function computeMoveMargin(engineResult: EngineResultForMargin): number {
  const moves = engineResult.bestMoves ?? [];
  if (moves.length < 2) return 0;
  return moves[1].eval - moves[0].eval;
}

/**
 * Human "error rate" at a position: 1 − (fraction of games that played best move).
 * If best move not in list, returns 1. Clamped to [0, 1].
 */
export function computeHumanErrorRate(
  bestMove: string,
  lichessMoves: Array<{ move: string; games: number }>,
): number {
  if (lichessMoves.length === 0) return 0;
  const total = lichessMoves.reduce((s, m) => s + m.games, 0);
  if (total === 0) return 0;
  const best = lichessMoves.find((m) => m.move.toLowerCase() === bestMove.toLowerCase());
  const bestGames = best?.games ?? 0;
  const fractionPlayedBest = bestGames / total;
  return Math.max(0, Math.min(1, 1 - fractionPlayedBest));
}

/**
 * Opponent branching factor: sum over opponent steps of (plausible moves - 1).
 * Higher = opponent has many options = worse for funneled prep.
 */
export function computeOpponentBranchingFactor(
  opponentMoveDistributionsPerStep: Array<{ move: string; probability: number }[]>,
  minProbabilityThreshold: number = OPPONENT_MIN_MOVE_PROBABILITY,
): number {
  let factor = 0;
  for (const dist of opponentMoveDistributionsPerStep) {
    const plausibleCount = dist.filter(
      (m) => m.probability >= minProbabilityThreshold,
    ).length;
    factor += Math.max(0, plausibleCount - 1);
  }
  return factor;
}

/**
 * Placeholder for "unnatural" move heuristic (e.g. only-move, counterintuitive).
 * TODO: implement using position features.
 */
export function computeUnnaturalScore(
  _move: string,
  _positionFeatures?: unknown,
): number {
  return 0;
}

export interface ComputeLineDifficultyOptions {
  opponentProbabilityProduct?: number;
  opponentBranchingFactor?: number;
}

/**
 * Aggregate difficulty score for a full line.
 * Includes optional opponent probability (positive) and branching penalty (negative).
 */
export function computeLineDifficulty(
  lineEngineData: LineEngineMove[],
  lineHumanData: LineHumanMove[],
  options?: ComputeLineDifficultyOptions,
): number {
  const n = Math.min(lineEngineData.length, lineHumanData.length);
  let score = 0;
  for (let i = 0; i < n; i++) {
    const eng = lineEngineData[i];
    const hum = lineHumanData[i];
    const margin = i > 0 ? Math.min(200, Math.max(-200, eng.eval)) : 0;
    const errorRate = hum.games > 0 ? 1 - hum.winrate : 0;
    score += margin * 0.1 + errorRate * 50;
  }
  if (options?.opponentProbabilityProduct != null) {
    score += options.opponentProbabilityProduct * LINE_SCORE_WEIGHT_OPPONENT_PROBABILITY;
  }
  if (options?.opponentBranchingFactor != null) {
    score -= options.opponentBranchingFactor * LINE_SCORE_WEIGHT_BRANCHING;
  }
  return Math.round(score * 10) / 10;
}
