import { Chess, type Square } from "chess.js";
import type { OpeningNode } from "./types";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Arrow tuple compatible with react-chessboard: [from, to, color?] */
export type BoardArrow = [string, string, string];

/**
 * Walk the opening tree following the given path of child indices.
 * Returns the node at the end of the path.
 */
export function getNodeAtPath(root: OpeningNode, path: number[]): OpeningNode {
  let node = root;
  for (const idx of path) {
    node = node.children[idx];
  }
  return node;
}

/**
 * Collect every node along the path (excluding the root).
 * Useful for building breadcrumbs of the move history.
 */
export function getNodesAlongPath(root: OpeningNode, path: number[]): OpeningNode[] {
  const nodes: OpeningNode[] = [];
  let node = root;
  for (const idx of path) {
    node = node.children[idx];
    nodes.push(node);
  }
  return nodes;
}

/**
 * Format a move with its number, e.g. "1. e4" (white) or "1…e5" (black).
 * `depth` is the 0-based half-move index in the tree (0 = white's first move).
 */
export function formatMoveLabel(move: string, depth: number): string {
  const moveNum = Math.floor(depth / 2) + 1;
  const isWhiteMove = depth % 2 === 0;
  return isWhiteMove ? `${moveNum}. ${move}` : `${moveNum}\u2026${move}`;
}

/**
 * Convert the children of a node into board arrows whose opacity reflects
 * how frequently each move is played relative to its siblings.
 */
export function childMovesToArrows(fen: string, children: OpeningNode[]): BoardArrow[] {
  if (children.length === 0) return [];

  const totalGames = children.reduce((sum, c) => sum + c.games, 0);
  if (totalGames === 0) return [];

  const arrows: BoardArrow[] = [];
  const chess = new Chess(fen);

  for (const child of children) {
    try {
      const move = chess.move(child.move);
      if (move) {
        const ratio = child.games / totalGames;
        // Scale opacity: 0.15 (rarely played) to 0.9 (most played)
        const opacity = 0.15 + ratio * 0.75;
        arrows.push([move.from, move.to, `rgba(255, 170, 0, ${opacity})`]);
      }
      chess.undo();
    } catch {
      // Invalid move for this position — skip
    }
  }

  return arrows;
}

/**
 * For a given piece on `square`, return the destination squares that
 * correspond to moves in the node's children (i.e. repertoire-legal moves).
 * Returns an array of { to, childIndex } pairs.
 */
export function getRepertoireMoves(
  fen: string,
  square: string,
  children: OpeningNode[],
): { to: string; childIndex: number }[] {
  const chess = new Chess(fen);
  const legalMoves = chess.moves({ square: square as Square, verbose: true });
  const results: { to: string; childIndex: number }[] = [];

  for (const lm of legalMoves) {
    const childIndex = children.findIndex((c) => c.move === lm.san);
    if (childIndex !== -1) {
      results.push({ to: lm.to, childIndex });
    }
  }

  return results;
}
