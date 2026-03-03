import { getHumanMoves } from "@/lib/lichess/getHumanMoves";
import { analyzePosition } from "@/lib/engine/analyzePosition";
import { LINE_ANALYSIS_DEPTH, LINE_ANALYSIS_MULTIPV } from "@/lib/config";

export type MoveProbabilitySource = "player" | "lichess" | "blended" | "engine";

export interface MoveWithProbability {
  move: string;
  probability: number;
  source: MoveProbabilitySource;
}

export interface MoveProbabilityResult {
  moves: MoveWithProbability[];
}

export interface OpponentProfile {
  ratingBucket: string;
  preparerColor: "white" | "black";
}

/** Normalize move for comparison (lowercase). */
function norm(move: string): string {
  return move.toLowerCase().trim();
}

/** Build distribution from Lichess moves (already UCI). */
function lichessMovesToDistribution(
  moves: { move: string; games: number }[],
): Map<string, { probability: number }> {
  const total = moves.reduce((s, m) => s + m.games, 0);
  if (total === 0) return new Map();

  const map = new Map<string, { probability: number }>();
  for (const { move, games } of moves) {
    const key = norm(move);
    const prob = games / total;
    const existing = map.get(key);
    if (existing) {
      existing.probability += prob;
    } else {
      map.set(key, { probability: prob });
    }
  }
  return map;
}

/** Engine bestMoves to distribution: softmax-like or top-1. Use simple 1 for best, rest by relative eval. */
function engineToDistribution(
  bestMoves: { move: string; eval: number }[],
): Map<string, { probability: number }> {
  if (bestMoves.length === 0) return new Map();
  const map = new Map<string, { probability: number }>();
  const bestEval = bestMoves[0]?.eval ?? 0;
  const expScale = 0.01;
  let sum = 0;
  for (const { move, eval: e } of bestMoves) {
    const diff = e - bestEval;
    const score = Math.exp(expScale * diff);
    sum += score;
    map.set(norm(move), { probability: score });
  }
  if (sum <= 0) return map;
  for (const [, v] of map) {
    v.probability /= sum;
  }
  return map;
}

/**
 * Get opponent move distribution at a position.
 * Lichess population (rating bucket) first; engine fallback when no Lichess data.
 */
export async function getOpponentMoveDistribution(
  fen: string,
  opponentProfile: OpponentProfile,
): Promise<MoveProbabilityResult> {
  const { ratingBucket } = opponentProfile;

  let lichessDist = new Map<string, { probability: number }>();
  try {
    const lichessResult = await getHumanMoves(fen, ratingBucket);
    lichessDist = lichessMovesToDistribution(lichessResult.moves);
  } catch {
    // Lichess can fail; fall back to engine
  }

  if (lichessDist.size > 0) {
    const moves: MoveWithProbability[] = [];
    for (const [moveNorm, { probability }] of lichessDist) {
      if (probability <= 0) continue;
      moves.push({ move: moveNorm, probability, source: "lichess" });
    }
    moves.sort((a, b) => b.probability - a.probability);
    return { moves };
  }

  const engineResult = await analyzePosition(
    fen,
    LINE_ANALYSIS_DEPTH,
    LINE_ANALYSIS_MULTIPV,
  );
  const dist = engineToDistribution(
    engineResult.bestMoves.map((m) => ({ move: m.move, eval: m.eval })),
  );
  const moves: MoveWithProbability[] = [];
  for (const [moveNorm, { probability }] of dist) {
    if (probability <= 0) continue;
    moves.push({ move: moveNorm, probability, source: "engine" });
  }
  moves.sort((a, b) => b.probability - a.probability);
  return { moves };
}
