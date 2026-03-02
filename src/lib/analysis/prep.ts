/**
 * Prep mode scoring and line-building logic.
 *
 * Pure functions that rank candidate moves for preparation against
 * a specific opponent, based on population data, the opponent's
 * opening history, and optional engine evaluation.
 */

import { Chess } from "chess.js";
import type {
  LichessExplorerMove,
  OpponentMoveInfo,
  PrepSuggestion,
  PrepLineMove,
  PrepTag,
} from "../types";
import {
  PREP_WEIGHT_POPULATION,
  PREP_WEIGHT_SURPRISE,
  PREP_WEIGHT_WEAKNESS,
  PREP_WEIGHT_ENGINE,
  PREP_MIN_POPULATION_GAMES,
  PREP_EVAL_FLOOR,
  PREP_SPECULATIVE_THRESHOLD,
  PREP_SOUND_THRESHOLD,
  PREP_WEAKNESS_WINRATE,
} from "../config";

// ---------------------------------------------------------------------------
// Rating bracket mapping
// ---------------------------------------------------------------------------

/**
 * Map a Chess.com rating to the Lichess opening explorer rating brackets.
 *
 * The explorer supports 0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500.
 * We pick the two buckets that straddle the expected Lichess equivalent,
 * which is typically ~100-200 higher than Chess.com for comparable formats.
 */
export function ratingToBrackets(chessComRating: number): string {
  // rough Chess.com → Lichess mapping (add ~100)
  const approx = chessComRating + 100;
  const buckets = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];

  // find the two surrounding buckets
  let lower = buckets[0];
  let upper = buckets[buckets.length - 1];
  for (let i = 0; i < buckets.length - 1; i++) {
    if (approx >= buckets[i] && approx < buckets[i + 1]) {
      lower = buckets[i];
      upper = buckets[i + 1];
      break;
    }
  }
  if (approx >= buckets[buckets.length - 1]) {
    lower = buckets[buckets.length - 2];
    upper = buckets[buckets.length - 1];
  }

  return `${lower},${upper}`;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Intermediate representation before engine eval is applied. */
export interface ScoredCandidate {
  move: string;
  populationWinRate: number; // 0-1, from preparer's perspective
  populationGames: number;
  opponentGames: number;
  opponentWinRate: number | null; // 0-1, opponent's win rate facing this move
  baseScore: number; // 0-85 (without engine component)
  tags: PrepTag[];
  reasoning: string;
}

/**
 * Compute the win-rate of a Lichess explorer move from the given colour's perspective.
 * Explorer always reports white/draws/black counts.
 */
function explorerWinRate(
  move: LichessExplorerMove,
  preparerColor: "white" | "black",
): number {
  const total = move.white + move.draws + move.black;
  if (total === 0) return 0.5;
  const wins = preparerColor === "white" ? move.white : move.black;
  return (wins + move.draws * 0.5) / total;
}

/**
 * Score a list of population moves against the opponent's known repertoire.
 *
 * Returns candidates sorted by score (descending), without the engine
 * component, which is added later after fetching evals.
 */
export function scorePrepCandidates(
  populationMoves: LichessExplorerMove[],
  opponentMoves: OpponentMoveInfo[],
  preparerColor: "white" | "black",
): ScoredCandidate[] {
  const opponentMap = new Map<string, OpponentMoveInfo>();
  for (const m of opponentMoves) {
    opponentMap.set(m.move, m);
  }

  const candidates: ScoredCandidate[] = [];

  for (const pm of populationMoves) {
    const total = pm.white + pm.draws + pm.black;
    if (total < PREP_MIN_POPULATION_GAMES) continue;

    const popWin = explorerWinRate(pm, preparerColor);
    const oppData = opponentMap.get(pm.san);
    const oppGames = oppData?.games ?? 0;
    // Opponent's win rate from *their* perspective (inverse of preparer)
    const oppWinRate = oppData != null ? oppData.winRate : null;

    // Factor 1: Population effectiveness (0-30)
    // 0 at 45%, max at 70%
    const popEffectiveness = Math.min(Math.max((popWin - 0.45) / (0.7 - 0.45), 0), 1);
    const popScore = popEffectiveness * PREP_WEIGHT_POPULATION;

    // Factor 2: Surprise value (0-25)
    // Max if opponent has 0 games, decreases as they've seen it more
    const surpriseRaw = oppGames === 0 ? 1.0 : Math.max(1.0 - oppGames / 20, 0);
    const surpriseScore = surpriseRaw * PREP_WEIGHT_SURPRISE;

    // Factor 3: Opponent weakness (0-30)
    // If opponent has faced this and does poorly
    let weaknessScore = 0;
    if (oppWinRate != null && oppGames > 0) {
      // oppWinRate is from opponent's perspective; lower = better for us
      const weaknessRaw = Math.min(Math.max((0.5 - oppWinRate) / (0.5 - 0.2), 0), 1);
      weaknessScore = weaknessRaw * PREP_WEIGHT_WEAKNESS;
    }

    const baseScore = popScore + surpriseScore + weaknessScore;

    // Tags
    const tags: PrepTag[] = [];
    if (oppGames === 0) tags.push("surprise");
    if (oppWinRate != null && oppWinRate < PREP_WEAKNESS_WINRATE) tags.push("weakness");

    // Reasoning
    const reasons: string[] = [];
    if (oppGames === 0) {
      reasons.push("Opponent has never faced this");
    } else if (oppGames <= 3) {
      reasons.push(
        `Opponent has only faced this ${oppGames} time${oppGames > 1 ? "s" : ""}`,
      );
    }
    if (oppWinRate != null && oppWinRate < PREP_WEAKNESS_WINRATE) {
      reasons.push(`opponent wins only ${Math.round(oppWinRate * 100)}% here`);
    }
    reasons.push(`${Math.round(popWin * 100)}% win rate at this level`);

    candidates.push({
      move: pm.san,
      populationWinRate: popWin,
      populationGames: total,
      opponentGames: oppGames,
      opponentWinRate: oppWinRate,
      baseScore,
      tags,
      reasoning: reasons.join(". ") + ".",
    });
  }

  candidates.sort((a, b) => b.baseScore - a.baseScore);
  return candidates;
}

/**
 * Refine candidate scores by incorporating engine evaluation.
 *
 * `evals` maps SAN move → centipawns from **preparer's** perspective.
 * Mutates the candidates in-place and re-sorts.
 */
export function applyEngineScores(
  candidates: ScoredCandidate[],
  evals: Map<string, number>,
): ScoredCandidate[] {
  for (const c of candidates) {
    const cp = evals.get(c.move);
    if (cp == null) continue;

    // Filter out objectively terrible moves
    if (cp < PREP_EVAL_FLOOR) {
      c.baseScore = -1; // will be filtered
      continue;
    }

    // Engine factor (0-15): +50cp = full bonus, -50cp = 0, below = penalty
    const engineNorm = Math.min(
      Math.max(
        (cp - PREP_SPECULATIVE_THRESHOLD) /
          (PREP_SOUND_THRESHOLD - PREP_SPECULATIVE_THRESHOLD),
        0,
      ),
      1,
    );
    c.baseScore += engineNorm * PREP_WEIGHT_ENGINE;

    // Tag updates
    if (cp < PREP_SPECULATIVE_THRESHOLD && !c.tags.includes("speculative"))
      c.tags.push("speculative");
    if (cp > PREP_SOUND_THRESHOLD && !c.tags.includes("sound")) c.tags.push("sound");
  }

  // Remove filtered moves and re-sort
  const valid = candidates.filter((c) => c.baseScore >= 0);
  valid.sort((a, b) => b.baseScore - a.baseScore);
  return valid;
}

/**
 * Convert a ScoredCandidate into a PrepSuggestion (without the line,
 * which is built separately). The engine eval in centipawns is attached
 * if available.
 */
export function candidateToSuggestion(
  candidate: ScoredCandidate,
  engineEval: number | null,
): PrepSuggestion {
  return {
    move: candidate.move,
    score: Math.round(Math.min(candidate.baseScore, 100)),
    tags: candidate.tags,
    reasoning: candidate.reasoning,
    populationWinRate: candidate.populationWinRate,
    populationGames: candidate.populationGames,
    opponentGames: candidate.opponentGames,
    opponentWinRate: candidate.opponentWinRate,
    engineEval: engineEval,
    line: [], // filled later by buildPrepLine
  };
}

// ---------------------------------------------------------------------------
// Line building
// ---------------------------------------------------------------------------

/** Callback type for fetching explorer data (injected for testability). */
export type ExplorerFetcher = (
  fen: string,
  speeds: string,
  ratings: string,
) => Promise<{ moves: LichessExplorerMove[] }>;

/**
 * Build a study line starting from `startFen` after playing `suggestedMove`.
 * Alternates between:
 *  - Opponent's most popular response (by total games)
 *  - Preparer's best-scoring reply (by population win rate)
 *
 * Returns an array of PrepLineMove entries.
 *
 * `depth` is the total number of half-moves to extend (including the
 * suggested first move).
 */
export async function buildPrepLine(
  startFen: string,
  suggestedMove: string,
  preparerColor: "white" | "black",
  ratings: string,
  speeds: string,
  depth: number,
  fetchExplorer: ExplorerFetcher,
): Promise<PrepLineMove[]> {
  const line: PrepLineMove[] = [];
  const chess = new Chess(startFen);

  // Helper: whose turn is it? white = true, black = false
  const isPreparerTurn = (): boolean => {
    const sideToMove = chess.turn(); // "w" or "b"
    return (
      (preparerColor === "white" && sideToMove === "w") ||
      (preparerColor === "black" && sideToMove === "b")
    );
  };

  // Play the suggested move first
  try {
    chess.move(suggestedMove);
  } catch {
    return line;
  }
  line.push({
    move: suggestedMove,
    fen: chess.fen(),
    isPlayerMove: !isPreparerTurn(), // we just moved, now it's the other side's turn
  });

  for (let i = 1; i < depth; i++) {
    const fen = chess.fen();
    let data: { moves: LichessExplorerMove[] };
    try {
      data = await fetchExplorer(fen, speeds, ratings);
    } catch {
      break; // network error, stop extending
    }

    if (data.moves.length === 0) break;

    const prepTurn = isPreparerTurn();
    let chosenMove: LichessExplorerMove;

    if (prepTurn) {
      // Preparer's turn: pick best win-rate move
      const sorted = [...data.moves]
        .filter((m) => m.white + m.draws + m.black >= PREP_MIN_POPULATION_GAMES)
        .sort((a, b) => {
          return explorerWinRate(b, preparerColor) - explorerWinRate(a, preparerColor);
        });
      chosenMove = sorted[0] ?? data.moves[0];
    } else {
      // Opponent's turn: pick most popular move
      const sorted = [...data.moves].sort(
        (a, b) => b.white + b.draws + b.black - (a.white + a.draws + a.black),
      );
      chosenMove = sorted[0];
    }

    try {
      chess.move(chosenMove.san);
    } catch {
      break;
    }

    const wr = explorerWinRate(chosenMove, preparerColor);

    line.push({
      move: chosenMove.san,
      fen: chess.fen(),
      isPlayerMove: prepTurn,
      populationWinRate: wr,
      annotation: prepTurn ? undefined : "likely",
    });
  }

  return line;
}
