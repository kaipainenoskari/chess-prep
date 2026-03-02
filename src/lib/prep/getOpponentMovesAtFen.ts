import { prisma } from "@/lib/prisma";
import { normalizeFenForLookup } from "@/lib/fen";

export interface OpponentMoveAtFen {
  move: string;
  games: number;
}

/**
 * Get moves and game counts for the opponent at a position from the project tree.
 * Returns SAN moves (from OpeningTreeNode). FEN is normalized for lookup (castling stripped).
 */
export async function getOpponentMovesAtFen(
  projectId: string,
  fen: string,
): Promise<OpponentMoveAtFen[]> {
  const normalizedFen = normalizeFenForLookup(fen);
  const node = await prisma.openingTreeNode.findUnique({
    where: { projectId_fen: { projectId, fen: normalizedFen } },
    select: { id: true },
  });
  if (!node) return [];

  const children = await prisma.openingTreeNode.findMany({
    where: { parentNodeId: node.id },
    select: { move: true, gamesCount: true },
  });

  return children
    .filter((c) => c.gamesCount > 0)
    .map((c) => ({ move: c.move, games: c.gamesCount }));
}
