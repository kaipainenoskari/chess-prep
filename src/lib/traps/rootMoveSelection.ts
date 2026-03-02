import type { EngineAnalysisResult } from "@/lib/engine/types";
import type { OpponentMoveDistribution } from "./trapDetection";
import { narrowness, expectedMistakeCp } from "./trapMetrics";
import { ONLY_MOVE_MARGIN_CP } from "@/lib/config";
import {
  ROOT_CANDIDATES_MAX,
  ROOT_MIN_EVAL_CP,
  ROOT_MIN_MARGIN_OR_MISTAKE_CP,
  PREP_ENGINE_FLOOR_PRACTICAL,
  PREP_PRACTICAL_WIN_RATE_MIN,
} from "@/lib/config";

export type RootCandidate = {
  move: string;
  eval: number;
  marginCp: number;
  narrowness: number;
  rootScore: number;
};

/** Forcing gap (best − second eval) at child position; positive when opponent is forced. */
function forcingGapCp(engineResult: EngineAnalysisResult): number {
  const moves = engineResult.bestMoves ?? [];
  if (moves.length < 2) return ONLY_MOVE_MARGIN_CP;
  return moves[0].eval - moves[1].eval;
}

function clampPositive(x: number): number {
  return Math.max(0, x);
}

/**
 * Root score from design: margin, narrowness, expected mistake, and engine eval.
 * score = 0.4*clamp(marginCp) + 0.3*clamp(narrowness*100) + 0.2*clamp(expectedMistakeCp) + 0.1*engineEval
 */
function computeRootScore(
  marginCp: number,
  narrownessVal: number,
  expectedMistakeCpVal: number,
  engineEval: number,
): number {
  return (
    0.4 * clampPositive(marginCp) +
    0.3 * clampPositive(narrownessVal * 100) +
    0.2 * clampPositive(expectedMistakeCpVal) +
    0.1 * engineEval
  );
}

export type GetChildPositionData = (move: string) => Promise<{
  engineResult: EngineAnalysisResult;
  opponentDistribution: OpponentMoveDistribution;
  /** Optional: preparer's human win rate (0–1) at child position for practical boost. */
  preparerWinRateAtChild?: number | null;
}>;

/**
 * Select root candidates by trap potential at the position after each move.
 * Fetches child position data per move, scores by margin/narrowness/expectedMistakeCp/eval,
 * filters by eval >= -50 and (marginCp >= 40 OR expectedMistakeCp >= 40), returns top 5.
 */
export async function selectRootCandidates(params: {
  engineResult: EngineAnalysisResult;
  getChildPositionData: GetChildPositionData;
}): Promise<RootCandidate[]> {
  const { engineResult, getChildPositionData } = params;
  const moves = engineResult.bestMoves ?? [];
  if (moves.length === 0) return [];

  const candidates: RootCandidate[] = [];

  for (const rootMove of moves) {
    const engineEval = rootMove.eval;
    const {
      engineResult: childEngine,
      opponentDistribution: childDist,
      preparerWinRateAtChild,
    } = await getChildPositionData(rootMove.move);

    const practicalWin =
      preparerWinRateAtChild != null &&
      preparerWinRateAtChild >= PREP_PRACTICAL_WIN_RATE_MIN;
    const evalOk =
      engineEval >= ROOT_MIN_EVAL_CP ||
      (practicalWin && engineEval >= PREP_ENGINE_FLOOR_PRACTICAL);
    if (!evalOk) continue;

    const marginCpVal = forcingGapCp(childEngine);
    const narrownessVal = narrowness(childEngine);
    const expectedMistakeCpVal = expectedMistakeCp(childEngine, childDist);

    if (
      marginCpVal < ROOT_MIN_MARGIN_OR_MISTAKE_CP &&
      expectedMistakeCpVal < ROOT_MIN_MARGIN_OR_MISTAKE_CP
    ) {
      continue;
    }

    let rootScore = computeRootScore(
      marginCpVal,
      narrownessVal,
      expectedMistakeCpVal,
      engineEval,
    );
    if (practicalWin && preparerWinRateAtChild != null) {
      rootScore += (preparerWinRateAtChild - 0.5) * 20;
    }

    candidates.push({
      move: rootMove.move,
      eval: engineEval,
      marginCp: marginCpVal,
      narrowness: narrownessVal,
      rootScore,
    });
  }

  candidates.sort((a, b) => b.rootScore - a.rootScore);
  return candidates.slice(0, ROOT_CANDIDATES_MAX);
}
