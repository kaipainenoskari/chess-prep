import { Chess } from "chess.js";
import { OPENING_TREE_MAX_DEPTH, OPENING_MAX_RESULTS } from "../config";
import type { ParsedGame, OpeningNode, OpeningRepertoire, GameResult } from "../types";

function createNode(move: string, fen: string): OpeningNode {
  return {
    move,
    fen,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    winRate: 0,
    children: [],
  };
}

function addGameToTree(root: OpeningNode, moves: string[], result: GameResult): void {
  let current = root;
  current.games++;
  if (result === "win") current.wins++;
  else if (result === "draw") current.draws++;
  else current.losses++;
  current.winRate = current.games > 0 ? current.wins / current.games : 0;

  const chess = new Chess();

  for (let i = 0; i < Math.min(moves.length, OPENING_TREE_MAX_DEPTH); i++) {
    const move = moves[i];
    try {
      chess.move(move);
    } catch {
      break;
    }
    const fen = chess.fen();

    let child = current.children.find((c) => c.move === move);
    if (!child) {
      child = createNode(move, fen);
      current.children.push(child);
    }

    child.games++;
    if (result === "win") child.wins++;
    else if (result === "draw") child.draws++;
    else child.losses++;
    child.winRate = child.games > 0 ? child.wins / child.games : 0;

    current = child;
  }
}

function sortTree(node: OpeningNode): void {
  node.children.sort((a, b) => b.games - a.games);
  for (const child of node.children) {
    sortTree(child);
  }
}

/**
 * Normalize a FEN for transposition comparison.
 * Strips halfmove clock (field 5) and fullmove number (field 6)
 * so positions reached at different move counts still match.
 */
export function normalizeFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/**
 * Post-process the tree to annotate nodes with transposition-merged stats.
 * Nodes sharing the same normalized FEN get aggregated games/wins/draws/losses,
 * stored in `mergedGames` and `mergedWinRate`.
 */
export function mergeTranspositions(root: OpeningNode): void {
  // Pass 1: collect stats per normalized FEN
  const fenStats = new Map<
    string,
    { games: number; wins: number; draws: number; losses: number }
  >();

  function collect(node: OpeningNode): void {
    if (node.move !== "root" && node.fen) {
      const key = normalizeFen(node.fen);
      const existing = fenStats.get(key);
      if (existing) {
        existing.games += node.games;
        existing.wins += node.wins;
        existing.draws += node.draws;
        existing.losses += node.losses;
      } else {
        fenStats.set(key, {
          games: node.games,
          wins: node.wins,
          draws: node.draws,
          losses: node.losses,
        });
      }
    }
    for (const child of node.children) {
      collect(child);
    }
  }

  collect(root);

  // Pass 2: annotate nodes where merged stats differ from direct stats
  function annotate(node: OpeningNode): void {
    if (node.move !== "root" && node.fen) {
      const key = normalizeFen(node.fen);
      const merged = fenStats.get(key);
      if (merged && merged.games > node.games) {
        node.mergedGames = merged.games;
        node.mergedWinRate = merged.games > 0 ? merged.wins / merged.games : 0;
      }
    }
    for (const child of node.children) {
      annotate(child);
    }
  }

  annotate(root);
}

/**
 * Build opening repertoire trees for a player.
 * Splits by colour: games where the player is White vs Black.
 */
export function buildOpeningRepertoire(
  games: ParsedGame[],
  timeClassFilter?: string,
): OpeningRepertoire {
  const filtered =
    timeClassFilter && timeClassFilter !== "all"
      ? games.filter((g) => g.timeClass === timeClassFilter)
      : games;

  const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const whiteRoot = createNode("root", startFen);
  const blackRoot = createNode("root", startFen);

  for (const game of filtered) {
    if (game.moves.length === 0) continue;

    if (game.playerColor === "white") {
      addGameToTree(whiteRoot, game.moves, game.result);
    } else {
      addGameToTree(blackRoot, game.moves, game.result);
    }
  }

  sortTree(whiteRoot);
  sortTree(blackRoot);

  mergeTranspositions(whiteRoot);
  mergeTranspositions(blackRoot);

  return { asWhite: whiteRoot, asBlack: blackRoot };
}

/**
 * Find the weakest opening lines (lowest win rate with enough games).
 */
export function findWeakLines(
  root: OpeningNode,
  minGames: number = 3,
  maxResults: number = OPENING_MAX_RESULTS,
): OpeningNode[] {
  const candidates: OpeningNode[] = [];

  function traverse(node: OpeningNode): void {
    if (node.move !== "root" && node.games >= minGames) {
      candidates.push(node);
    }
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(root);
  candidates.sort((a, b) => a.winRate - b.winRate);
  return candidates.slice(0, maxResults);
}

/**
 * Find the strongest opening lines.
 */
export function findStrongLines(
  root: OpeningNode,
  minGames: number = 3,
  maxResults: number = OPENING_MAX_RESULTS,
): OpeningNode[] {
  const candidates: OpeningNode[] = [];

  function traverse(node: OpeningNode): void {
    if (node.move !== "root" && node.games >= minGames) {
      candidates.push(node);
    }
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(root);
  candidates.sort((a, b) => b.winRate - a.winRate);
  return candidates.slice(0, maxResults);
}
