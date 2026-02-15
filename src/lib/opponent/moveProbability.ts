import { Chess } from "chess.js";
import { getOpponentMovesAtFen } from "@/lib/prep/getOpponentMovesAtFen";
import { getHumanMoves } from "@/lib/lichess/getHumanMoves";
import { analyzePosition } from "@/lib/engine/analyzePosition";
import {
  OPPONENT_PLAYER_WEIGHT,
  OPPONENT_LICHESS_WEIGHT,
  LINE_ANALYSIS_DEPTH,
  LINE_ANALYSIS_MULTIPV,
} from "@/lib/config";

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
  projectId?: string;
  ratingBucket: string;
  preparerColor: "white" | "black";
}

/** Convert SAN to UCI in the given position. Returns null if invalid. */
function sanToUci(fen: string, san: string): string | null {
  const game = new Chess(fen);
  const moveObj = game.move(san);
  if (!moveObj) return null;
  const uci = moveObj.from + moveObj.to + (moveObj.promotion ? moveObj.promotion : "");
  return uci;
}

/** Normalize move for comparison (lowercase). */
function norm(move: string): string {
  return move.toLowerCase().trim();
}

/** Build distribution from player moves (SAN). Converts to UCI and skips failed. */
function playerMovesToDistribution(
  fen: string,
  playerMoves: { move: string; games: number }[],
): Map<string, { probability: number }> {
  const total = playerMoves.reduce((s, m) => s + m.games, 0);
  if (total === 0) return new Map();

  const map = new Map<string, { probability: number }>();
  for (const { move: san, games } of playerMoves) {
    const uci = sanToUci(fen, san);
    if (!uci) continue;
    const key = norm(uci);
    const existing = map.get(key);
    const prob = games / total;
    if (existing) {
      existing.probability += prob;
    } else {
      map.set(key, { probability: prob });
    }
  }
  return map;
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

/** Blend two distributions by weight. Keys are normalized. */
function blendDistributions(
  player: Map<string, { probability: number }>,
  lichess: Map<string, { probability: number }>,
  playerWeight: number,
  lichessWeight: number,
): Map<string, { probability: number }> {
  const allKeys = new Set([...player.keys(), ...lichess.keys()]);
  const out = new Map<string, { probability: number }>();
  for (const key of allKeys) {
    const p = player.get(key)?.probability ?? 0;
    const l = lichess.get(key)?.probability ?? 0;
    const prob = p * playerWeight + l * lichessWeight;
    if (prob > 0) out.set(key, { probability: prob });
  }
  return out;
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
 * Priority: player (Chess.com) > blend with Lichess > Lichess only > engine fallback.
 */
export async function getOpponentMoveDistribution(
  fen: string,
  opponentProfile: OpponentProfile,
): Promise<MoveProbabilityResult> {
  const { projectId, ratingBucket, preparerColor: _preparerColor } = opponentProfile;

  let playerDist = new Map<string, { probability: number }>();
  if (projectId) {
    const playerMoves = await getOpponentMovesAtFen(projectId, fen);
    playerDist = playerMovesToDistribution(fen, playerMoves);
  }

  let lichessDist = new Map<string, { probability: number }>();
  try {
    const lichessResult = await getHumanMoves(fen, ratingBucket);
    lichessDist = lichessMovesToDistribution(lichessResult.moves);
  } catch {
    // Lichess can fail; continue with player or engine
  }

  const hasPlayer = playerDist.size > 0;
  const hasLichess = lichessDist.size > 0;

  let dist: Map<string, { probability: number }>;
  let source: MoveProbabilitySource;

  if (hasPlayer && hasLichess) {
    dist = blendDistributions(
      playerDist,
      lichessDist,
      OPPONENT_PLAYER_WEIGHT,
      OPPONENT_LICHESS_WEIGHT,
    );
    source = "blended";
  } else if (hasPlayer) {
    dist = playerDist;
    source = "player";
  } else if (hasLichess) {
    dist = lichessDist;
    source = "lichess";
  } else {
    const engineResult = await analyzePosition(
      fen,
      LINE_ANALYSIS_DEPTH,
      LINE_ANALYSIS_MULTIPV,
    );
    dist = engineToDistribution(
      engineResult.bestMoves.map((m) => ({ move: m.move, eval: m.eval })),
    );
    source = "engine";
  }

  const moves: MoveWithProbability[] = [];
  for (const [moveNorm, { probability }] of dist) {
    if (probability <= 0) continue;
    moves.push({
      move: moveNorm,
      probability,
      source,
    });
  }
  moves.sort((a, b) => b.probability - a.probability);

  return { moves };
}
