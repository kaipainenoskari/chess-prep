import type { EngineAnalysisResult } from "@/lib/engine/types";
import type { MoveDistributionEntry } from "./trapMetrics";
import {
  marginCp,
  narrowness,
  probabilityDeviate,
  expectedMistakeCp,
  expectedEvalSwing,
  probabilityWinningAfterMistake,
} from "./trapMetrics";
import {
  ONLY_MOVE_MARGIN_CP,
  TRAP_DETECTION_MARGIN_CP,
  TRAP_DETECTION_NARROWNESS_MIN,
  TRAP_DETECTION_P_DEVIATE_MIN,
  TRAP_DETECTION_EXPECTED_MISTAKE_CP,
  TRAP_DETECTION_EXPECTED_SWING_CP,
  TRAP_DETECTION_P_WINNING_MIN,
  TRAP_DETECTION_ENTRY_PROBABILITY_MIN,
  PREP_PRACTICAL_WIN_RATE_MIN,
} from "@/lib/config";

/** Opponent move distribution: list of move + probability (e.g. from getOpponentMoveDistribution). */
export type OpponentMoveDistribution = MoveDistributionEntry[];

export type TrapNodeResult = {
  isTrap: boolean;
  metrics: {
    marginCp: number;
    narrowness: number;
    pDeviate: number;
    expectedMistakeCp: number;
    expectedSwing: number;
    pWinningAfterMistake: number;
  };
};

/** Forcing gap (best eval − second eval); used for threshold so ">= 80" means second is much worse. */
function forcingGapCp(engineResult: EngineAnalysisResult): number {
  const moves = engineResult.bestMoves ?? [];
  if (moves.length < 2) return ONLY_MOVE_MARGIN_CP;
  return moves[0].eval - moves[1].eval;
}

/**
 * Determines whether a position (opponent to move) is a trap node.
 * Uses Phase 1 metrics and config thresholds. Returns metrics even when isTrap is false.
 * When humanWinRateAfterMistake is provided and >= PREP_PRACTICAL_WIN_RATE_MIN, counts as "winning" for trap (practical win).
 */
export function isTrapNode(params: {
  engineResult: EngineAnalysisResult;
  moveDistribution: OpponentMoveDistribution;
  entryProbability: number;
  /** Optional: weighted preparer win rate after opponent mistake (from Lichess); when >= threshold, treat as practically winning. */
  humanWinRateAfterMistake?: number | null;
}): TrapNodeResult {
  const { engineResult, moveDistribution, entryProbability, humanWinRateAfterMistake } =
    params;

  const metrics = {
    marginCp: marginCp(engineResult),
    narrowness: narrowness(engineResult),
    pDeviate: probabilityDeviate(engineResult, moveDistribution),
    expectedMistakeCp: expectedMistakeCp(engineResult, moveDistribution),
    expectedSwing: expectedEvalSwing(engineResult, moveDistribution),
    pWinningAfterMistake: probabilityWinningAfterMistake(engineResult, moveDistribution),
  };

  const practicallyWinning =
    humanWinRateAfterMistake != null &&
    humanWinRateAfterMistake >= PREP_PRACTICAL_WIN_RATE_MIN;
  const gap = forcingGapCp(engineResult);
  const isTrap =
    gap >= TRAP_DETECTION_MARGIN_CP &&
    metrics.narrowness >= TRAP_DETECTION_NARROWNESS_MIN &&
    metrics.pDeviate >= TRAP_DETECTION_P_DEVIATE_MIN &&
    metrics.expectedMistakeCp >= TRAP_DETECTION_EXPECTED_MISTAKE_CP &&
    metrics.expectedSwing >= TRAP_DETECTION_EXPECTED_SWING_CP &&
    (metrics.pWinningAfterMistake >= TRAP_DETECTION_P_WINNING_MIN ||
      practicallyWinning) &&
    entryProbability >= TRAP_DETECTION_ENTRY_PROBABILITY_MIN;

  return { isTrap, metrics };
}
