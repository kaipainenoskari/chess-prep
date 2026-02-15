import { Chess } from "chess.js";
import { normalizeFenForLookup } from "@/lib/fen";
import { getOpponentMoveDistribution } from "@/lib/opponent/moveProbability";
import type { OpponentProfile } from "@/lib/opponent/moveProbability";
import { getHumanMoves } from "@/lib/lichess/getHumanMoves";
import { analyzePosition } from "@/lib/engine/analyzePosition";
import type { LineEngineMove, LineHumanMove } from "@/lib/analysis/metrics";
import {
  LINE_ANALYSIS_DEPTH,
  LINE_ANALYSIS_LINE_DEPTH,
  LINE_ANALYSIS_MULTIPV,
  OPPONENT_MIN_MOVE_PROBABILITY,
  OPPONENT_FORCED_BRANCH_THRESHOLD,
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
  depth: number;
  preparerColor: "white" | "black";
  opponentProfile: OpponentProfile;
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
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

/**
 * Expand one or more lines from (currentFen, depthLeft), appending to the given
 * line state. Returns an array of completed lines (when depth 0 or no move).
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
  if (depthLeft <= 0) {
    const entryProbability =
      opponentProbs.length > 0 ? opponentProbs.reduce((p, q) => p * q, 1) : 1;
    return [
      {
        lineMoves: [...lineMoves],
        lineEngine: [...lineEngine],
        lineHuman: [...lineHuman],
        opponentProbabilityPerStep: [...opponentProbs],
        opponentDistributionsPerStep: [...opponentDistributionsSoFar],
        entryProbability,
      },
    ];
  }

  const fenNorm = normalizeFenForLookup(currentFen);
  const opponentTurn = isOpponentTurn(fenNorm, options.preparerColor);
  const minProb = options.minOpponentProbability ?? OPPONENT_MIN_MOVE_PROBABILITY;
  const forcedThresh = options.forcedBranchThreshold ?? OPPONENT_FORCED_BRANCH_THRESHOLD;

  if (opponentTurn) {
    const [dist, engineResult, humanResult] = await Promise.all([
      getOpponentMoveDistribution(fenNorm, options.opponentProfile),
      analyzePosition(fenNorm, LINE_ANALYSIS_DEPTH, LINE_ANALYSIS_MULTIPV),
      getHumanMoves(fenNorm, options.opponentProfile.ratingBucket),
    ]);

    const allowed = dist.moves.filter((m) => m.probability >= minProb);
    if (allowed.length === 0) {
      const entryProbability =
        opponentProbs.length > 0 ? opponentProbs.reduce((p, q) => p * q, 1) : 1;
      return [
        {
          lineMoves: [...lineMoves],
          lineEngine: [...lineEngine],
          lineHuman: [...lineHuman],
          opponentProbabilityPerStep: [...opponentProbs],
          opponentDistributionsPerStep: [...opponentDistributionsSoFar],
          entryProbability,
        },
      ];
    }

    const forcedMove = allowed.find((m) => m.probability >= forcedThresh) ?? null;
    const toExpand = forcedMove ? [forcedMove] : allowed;

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

  // Preparer's turn
  const [engineResult, humanResult] = await Promise.all([
    analyzePosition(fenNorm, LINE_ANALYSIS_DEPTH, LINE_ANALYSIS_MULTIPV),
    getHumanMoves(fenNorm, options.opponentProfile.ratingBucket),
  ]);

  const moveToPlay =
    isFirstStep && initialMove
      ? (engineResult.bestMoves.find((m) => moveMatches(m.move, initialMove)) ??
        engineResult.bestMoves[0])
      : engineResult.bestMoves[0];

  if (!moveToPlay) {
    const entryProbability =
      opponentProbs.length > 0 ? opponentProbs.reduce((p, q) => p * q, 1) : 1;
    return [
      {
        lineMoves: [...lineMoves],
        lineEngine: [...lineEngine],
        lineHuman: [...lineHuman],
        opponentProbabilityPerStep: [...opponentProbs],
        opponentDistributionsPerStep: [...opponentDistributionsSoFar],
        entryProbability,
      },
    ];
  }

  const humanMove = humanResult.moves.find((m) => moveMatches(m.move, moveToPlay.move));
  const game = new Chess(fenNorm);
  const { from, to, promotion } = uciToFromTo(moveToPlay.move);
  const applied = game.move({ from, to, promotion });
  if (!applied) {
    const entryProbability =
      opponentProbs.length > 0 ? opponentProbs.reduce((p, q) => p * q, 1) : 1;
    return [
      {
        lineMoves: [...lineMoves],
        lineEngine: [...lineEngine],
        lineHuman: [...lineHuman],
        opponentProbabilityPerStep: [...opponentProbs],
        opponentDistributionsPerStep: [...opponentDistributionsSoFar],
        entryProbability,
      },
    ];
  }

  const nextFen = normalizeFenForLookup(game.fen());
  return expandStep(
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
}

/**
 * Expand realistic lines from root: preparer moves follow engine, opponent moves
 * are constrained by getOpponentMoveDistribution (min prob, forced branch).
 * Returns one or more lines per initial move when opponent has multiple options.
 */
export async function expandRealisticLines(
  rootFen: string,
  initialMove: string,
  options: ExpandRealisticLinesOptions,
): Promise<ExpandedLine[]> {
  const depth = options.depth ?? LINE_ANALYSIS_LINE_DEPTH;
  const fenNorm = normalizeFenForLookup(rootFen);
  return expandStep(fenNorm, depth, initialMove, true, [], [], [], [], [], {
    ...options,
    depth,
  });
}
