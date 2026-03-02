import type { EngineAnalysisResult } from "@/lib/engine/types";
import {
  MARGIN_NEAR_BEST_CP,
  ONLY_MOVE_MARGIN_CP,
  TRAP_DEFAULT_MOVE_EVAL_DROP_CP,
  TRAP_WINNING_CP,
  EARLY_BONUS_MAX,
  EARLY_BONUS_DECAY_PER_HALFMOVE,
} from "@/lib/config";

/** Move distribution entry: move (UCI) and probability. */
export interface MoveDistributionEntry {
  move: string;
  probability: number;
}

function norm(move: string): string {
  return move.toLowerCase().trim();
}

/**
 * Eval (cp) for a move: from multipv if present, else bestEval - TRAP_DEFAULT_MOVE_EVAL_DROP_CP.
 */
function getEvalForMove(engineResult: EngineAnalysisResult, move: string): number {
  const bestMoves = engineResult.bestMoves ?? [];
  const bestEval = bestMoves[0]?.eval ?? 0;
  const key = norm(move);
  const found = bestMoves.find((m) => norm(m.move) === key);
  return found != null ? found.eval : bestEval - TRAP_DEFAULT_MOVE_EVAL_DROP_CP;
}

// ---------------------------------------------------------------------------
// Engine forcing
// ---------------------------------------------------------------------------

/**
 * Best vs second-best margin (cp). Large value when only one move (only-move signal).
 */
export function marginCp(engineResult: EngineAnalysisResult): number {
  const moves = engineResult.bestMoves ?? [];
  if (moves.length < 2) return ONLY_MOVE_MARGIN_CP;
  return moves[1].eval - moves[0].eval;
}

/**
 * Count of moves within thresholdCp of the best eval.
 */
export function nNearBest(
  engineResult: EngineAnalysisResult,
  thresholdCp: number = MARGIN_NEAR_BEST_CP,
): number {
  const moves = engineResult.bestMoves ?? [];
  if (moves.length === 0) return 0;
  const bestEval = moves[0].eval;
  const minEval = bestEval - thresholdCp;
  return moves.filter((m) => m.eval >= minEval).length;
}

/**
 * Narrowness = 1 / n_near_best. 1 when only move, smaller when many options.
 */
export function narrowness(
  engineResult: EngineAnalysisResult,
  thresholdCp: number = MARGIN_NEAR_BEST_CP,
): number {
  const n = nNearBest(engineResult, thresholdCp);
  return n === 0 ? 0 : 1 / n;
}

/**
 * Forcing score at the position after the preparer's move (opponent to move).
 * Equals margin_cp at that position.
 */
export function forcingAfterPreparerMove(
  engineResultAfterMove: EngineAnalysisResult,
): number {
  return marginCp(engineResultAfterMove);
}

// ---------------------------------------------------------------------------
// Opponent mistake likelihood
// ---------------------------------------------------------------------------

/**
 * Probability that the opponent plays the engine best move (from distribution).
 */
export function probabilityBestMove(
  engineResult: EngineAnalysisResult,
  moveDistribution: MoveDistributionEntry[],
): number {
  const bestMoves = engineResult.bestMoves ?? [];
  const bestMove = bestMoves[0]?.move;
  if (bestMove == null) return 0;
  const key = norm(bestMove);
  const entry = moveDistribution.find((m) => norm(m.move) === key);
  return entry?.probability ?? 0;
}

/**
 * Probability that the opponent deviates from the best move.
 */
export function probabilityDeviate(
  engineResult: EngineAnalysisResult,
  moveDistribution: MoveDistributionEntry[],
): number {
  return 1 - probabilityBestMove(engineResult, moveDistribution);
}

/**
 * Expected mistake severity (cp): sum over moves of p_m * max(0, bestEval - eval(m)).
 */
export function expectedMistakeCp(
  engineResult: EngineAnalysisResult,
  moveDistribution: MoveDistributionEntry[],
): number {
  const bestMoves = engineResult.bestMoves ?? [];
  const bestEval = bestMoves[0]?.eval ?? 0;
  let sum = 0;
  for (const { move, probability } of moveDistribution) {
    const evalM = getEvalForMove(engineResult, move);
    sum += probability * Math.max(0, bestEval - evalM);
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Punishment
// ---------------------------------------------------------------------------

/**
 * Expected eval swing (cp gain for us): sum_m p_m * max(0, eval(best) - eval(m)).
 */
export function expectedEvalSwing(
  engineResult: EngineAnalysisResult,
  moveDistribution: MoveDistributionEntry[],
): number {
  return expectedMistakeCp(engineResult, moveDistribution);
}

/**
 * Probability that after the opponent's move we have a winning position (our eval >= winningCp).
 * Our eval after move m = -eval(m) (flip opponent's eval). Include m when eval(m) <= -winningCp.
 */
export function probabilityWinningAfterMistake(
  engineResult: EngineAnalysisResult,
  moveDistribution: MoveDistributionEntry[],
  winningCp: number = TRAP_WINNING_CP,
): number {
  let sum = 0;
  for (const { move, probability } of moveDistribution) {
    const evalM = getEvalForMove(engineResult, move);
    if (evalM <= -winningCp) sum += probability;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Line length
// ---------------------------------------------------------------------------

/**
 * Early bonus: higher when critical index is small. Linear decay.
 * Returns 0 when criticalIndex is null.
 */
export function earlyBonus(
  criticalIndex: number | null,
  maxBonus: number = EARLY_BONUS_MAX,
  decayPerHalfMove: number = EARLY_BONUS_DECAY_PER_HALFMOVE,
): number {
  if (criticalIndex === null) return 0;
  return Math.max(0, maxBonus - decayPerHalfMove * criticalIndex);
}
