import { Chess } from "chess.js";
import { normalizeFenForLookup } from "@/lib/fen";
import { getOpponentMoveDistribution } from "@/lib/opponent/moveProbability";
import type { OpponentProfile } from "@/lib/opponent/moveProbability";
import { getHumanMoves } from "@/lib/lichess/getHumanMoves";
import { analyzePosition } from "@/lib/engine/analyzePosition";
import type { LineEngineMove, LineHumanMove } from "@/lib/analysis/metrics";
import {
  LINE_ANALYSIS_DEPTH,
  LINE_ANALYSIS_MULTIPV,
  PREP_EXPANSION_MAX_DEPTH,
  PREP_MIN_HALFMOVES_BEFORE_WINNING,
  OPPONENT_MIN_PROBABILITY_TO_EXPAND,
  OPPONENT_FORCED_BRANCH_THRESHOLD,
  PREP_MIN_POPULATION_GAMES,
} from "@/lib/config";

export interface ExpandedLine {
  lineMoves: string[];
  lineEngine: LineEngineMove[];
  lineHuman: LineHumanMove[];
  /** Opponent move probability at each half-move (only for opponent turns). */
  opponentProbabilityPerStep: number[];
  /** Full distribution at each opponent turn (for branching factor). */
  opponentDistributionsPerStep: Array<{ move: string; probability: number }[]>;
  /** Product of opponent probabilities = probability opponent enters this line. */
  entryProbability: number;
}

export interface ExpandRealisticLinesOptions {
  /** Max half-moves (safety cap); expansion stops earlier on min prob or winning. */
  maxDepth: number;
  preparerColor: "white" | "black";
  opponentProfile: OpponentProfile;
  /** Stop expanding when entry probability drops below this. */
  minEntryProbability: number;
  /** Return line when practical win rate (preparer view) at position >= this. */
  minPracticalWinRate: number;
  minOpponentProbability?: number;
  forcedBranchThreshold?: number;
}

const CASTLING_ALIASES: Record<string, string> = {
  e1h1: "e1g1",
  e1a1: "e1c1",
  e8h8: "e8g8",
  e8a8: "e8c8",
};

function normalizeUci(uci: string): string {
  const key = uci.slice(0, 4).toLowerCase();
  return CASTLING_ALIASES[key] ?? uci;
}

function uciToFromTo(uci: string): {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
} {
  const n = normalizeUci(uci);
  return {
    from: n.slice(0, 2),
    to: n.slice(2, 4),
    promotion: n.length > 4 ? (n[4] as "q" | "r" | "b" | "n") : undefined,
  };
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
  return normalizeUci(a) === normalizeUci(b);
}

/** Dedupe by normalized UCI (keeps first occurrence; case-insensitive). */
function dedupeByMove<T>(items: T[], getMove: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((t) => {
    const key = normalizeUci(getMove(t)).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function currentEntryProbability(opponentProbs: number[]): number {
  return opponentProbs.length > 0 ? opponentProbs.reduce((p, q) => p * q, 1) : 1;
}

function terminalLine(
  lineMoves: string[],
  lineEngine: LineEngineMove[],
  lineHuman: LineHumanMove[],
  opponentProbs: number[],
  opponentDistributionsSoFar: Array<{ move: string; probability: number }[]>,
): ExpandedLine {
  return {
    lineMoves: [...lineMoves],
    lineEngine: [...lineEngine],
    lineHuman: [...lineHuman],
    opponentProbabilityPerStep: [...opponentProbs],
    opponentDistributionsPerStep: [...opponentDistributionsSoFar],
    entryProbability: currentEntryProbability(opponentProbs),
  };
}

/** Practical win rate for preparer at this position: from human moves (side to move). */
function practicalWinRatePreparer(
  moves: Array<{ move: string; games: number; winrate: number }>,
  preparerColor: "white" | "black",
  sideToMove: "w" | "b",
): number {
  if (moves.length === 0) return 0.5;
  const bestWinRate = Math.max(...moves.map((m) => m.winrate));
  const preparerToMove =
    (sideToMove === "w" && preparerColor === "white") ||
    (sideToMove === "b" && preparerColor === "black");
  return preparerToMove ? bestWinRate : 1 - bestWinRate;
}

/**
 * Expand lines: stop when entry prob below bar, when we hit winning win rate, or at max depth.
 * Opponent: only expand moves >= OPPONENT_MIN_PROBABILITY_TO_EXPAND. Preparer: top X by win rate.
 */
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
  options: ExpandRealisticLinesOptions,
): Promise<ExpandedLine[]> {
  const entryProb = currentEntryProbability(opponentProbs);
  if (entryProb < options.minEntryProbability) {
    return [
      terminalLine(
        lineMoves,
        lineEngine,
        lineHuman,
        opponentProbs,
        opponentDistributionsSoFar,
      ),
    ];
  }

  if (depthLeft <= 0) {
    return [
      terminalLine(
        lineMoves,
        lineEngine,
        lineHuman,
        opponentProbs,
        opponentDistributionsSoFar,
      ),
    ];
  }

  const fenNorm = normalizeFenForLookup(currentFen);
  const opponentTurn = isOpponentTurn(fenNorm, options.preparerColor);
  const forcedThresh = options.forcedBranchThreshold ?? OPPONENT_FORCED_BRANCH_THRESHOLD;

  if (opponentTurn) {
    const [dist, engineResult, humanResult] = await Promise.all([
      getOpponentMoveDistribution(fenNorm, options.opponentProfile),
      analyzePosition(fenNorm, LINE_ANALYSIS_DEPTH, LINE_ANALYSIS_MULTIPV),
      getHumanMoves(fenNorm, options.opponentProfile.ratingBucket),
    ]);

    const side = sideToMove(fenNorm);
    const winRateHere = practicalWinRatePreparer(
      humanResult.moves,
      options.preparerColor,
      side,
    );
    const canStopWinning =
      lineMoves.length >= PREP_MIN_HALFMOVES_BEFORE_WINNING &&
      winRateHere >= options.minPracticalWinRate;
    if (canStopWinning) {
      return [
        terminalLine(
          lineMoves,
          lineEngine,
          lineHuman,
          opponentProbs,
          opponentDistributionsSoFar,
        ),
      ];
    }

    const minProb = options.minOpponentProbability ?? OPPONENT_MIN_PROBABILITY_TO_EXPAND;
    const allowed = (dist?.moves ?? []).filter((m) => m.probability >= minProb);
    if (allowed.length === 0) {
      return [
        terminalLine(
          lineMoves,
          lineEngine,
          lineHuman,
          opponentProbs,
          opponentDistributionsSoFar,
        ),
      ];
    }

    const dedupedAllowed = dedupeByMove(allowed, (m) => m.move);
    const forcedMove = dedupedAllowed.find((m) => m.probability >= forcedThresh) ?? null;
    const toExpand = forcedMove ? [forcedMove] : dedupedAllowed;

    const out: ExpandedLine[] = [];
    for (const { move: oppMove, probability } of toExpand) {
      const engineMove =
        engineResult.bestMoves.find((m) => moveMatches(m.move, oppMove)) ??
        engineResult.bestMoves[0];
      const eval_ = engineMove ? engineMove.eval : 0;
      const humanMove = humanResult.moves.find((m) => moveMatches(m.move, oppMove));

      const game = new Chess(fenNorm);
      const { from, to, promotion } = uciToFromTo(oppMove);
      const applied = game.move({ from, to, promotion });
      if (!applied) continue;

      const nextFen = normalizeFenForLookup(game.fen());
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
        [...opponentDistributionsSoFar, dist.moves],
        options,
      );
      out.push(...nextLines);
    }
    return out;
  }

  // Preparer's turn: expand top N moves by win rate
  const [engineResult, humanResult] = await Promise.all([
    analyzePosition(fenNorm, LINE_ANALYSIS_DEPTH, LINE_ANALYSIS_MULTIPV),
    getHumanMoves(fenNorm, options.opponentProfile.ratingBucket),
  ]);

  const side = sideToMove(fenNorm);
  const winRateHere = practicalWinRatePreparer(
    humanResult.moves,
    options.preparerColor,
    side,
  );
  const canStopWinning =
    lineMoves.length >= PREP_MIN_HALFMOVES_BEFORE_WINNING &&
    winRateHere >= options.minPracticalWinRate;
  if (canStopWinning) {
    return [
      terminalLine(
        lineMoves,
        lineEngine,
        lineHuman,
        opponentProbs,
        opponentDistributionsSoFar,
      ),
    ];
  }

  let movesToExpand: Array<{ move: string; games: number; winrate: number }> = [];
  if (isFirstStep && initialMove) {
    const match = humanResult.moves.find((m) => moveMatches(m.move, initialMove));
    if (match) movesToExpand = [match];
  }
  if (movesToExpand.length === 0) {
    const withEnoughGames = humanResult.moves.filter(
      (m) => m.games >= PREP_MIN_POPULATION_GAMES,
    );
    const source = withEnoughGames.length > 0 ? withEnoughGames : humanResult.moves;
    const sorted = [...source].sort((a, b) => b.winrate - a.winrate);
    movesToExpand = dedupeByMove(sorted, (m) => m.move);
  }
  if (movesToExpand.length === 0 && engineResult.bestMoves[0]) {
    const fallback = engineResult.bestMoves[0];
    const humanMove = humanResult.moves.find((m) => moveMatches(m.move, fallback.move));
    movesToExpand = [
      {
        move: fallback.move,
        games: humanMove?.games ?? 0,
        winrate: humanMove?.winrate ?? 0.5,
      },
    ];
  }

  const out: ExpandedLine[] = [];
  for (const { move: prepMove, games, winrate } of movesToExpand) {
    const eng = engineResult.bestMoves.find((m) => moveMatches(m.move, prepMove));
    const moveToPlay = eng
      ? { move: eng.move, eval: eng.eval }
      : engineResult.bestMoves[0];
    if (!moveToPlay) continue;

    const game = new Chess(fenNorm);
    const { from, to, promotion } = uciToFromTo(moveToPlay.move);
    const applied = game.move({ from, to, promotion });
    if (!applied) continue;

    const nextFen = normalizeFenForLookup(game.fen());
    const nextLines = await expandStep(
      nextFen,
      depthLeft - 1,
      null,
      false,
      [...lineMoves, moveToPlay.move],
      [...lineEngine, { move: moveToPlay.move, eval: moveToPlay.eval }],
      [...lineHuman, { move: moveToPlay.move, games, winrate }],
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
      ),
    ];
  }
  return out;
}

/**
 * Expand realistic lines from root. Stops when entry prob < bar, practical win rate >= bar, or max depth.
 * Opponent: all moves >= OPPONENT_MIN_PROBABILITY_TO_EXPAND (or single move if forced). Preparer: all moves with enough games.
 */
export async function expandRealisticLines(
  rootFen: string,
  initialMove: string,
  options: ExpandRealisticLinesOptions,
): Promise<ExpandedLine[]> {
  const maxDepth = options.maxDepth ?? PREP_EXPANSION_MAX_DEPTH;
  const fenNorm = normalizeFenForLookup(rootFen);
  return expandStep(fenNorm, maxDepth, initialMove, true, [], [], [], [], [], {
    ...options,
    maxDepth,
  });
}
