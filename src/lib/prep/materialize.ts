import type { OpeningNode, OpeningRepertoire } from "@/lib/types";
import { buildOpeningRepertoire } from "@/lib/analysis/openings";
import type { ParsedGame } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { normalizeFenForLookup } from "@/lib/fen";

const ANALYSIS_STATUS_UNSCANNED = "UNSCANNED";

export interface MaterializeInput {
  projectId: string;
  games: ParsedGame[];
  timeClass: string | null;
}

/**
 * Collect (fen, move, parentFen, games) for every node in the tree in BFS order.
 * Root has parentFen null and move "".
 */
function collectNodes(
  root: OpeningNode,
  rootFen: string,
): { fen: string; move: string; parentFen: string | null; games: number }[] {
  const out: { fen: string; move: string; parentFen: string | null; games: number }[] =
    [];
  const queue: { node: OpeningNode; parentFen: string | null }[] = [
    { node: root, parentFen: null },
  ];
  while (queue.length > 0) {
    const { node, parentFen } = queue.shift()!;
    const rawFen = node.fen ?? rootFen;
    const fen = normalizeFenForLookup(rawFen);
    const move = node.move === "root" ? "" : node.move;
    out.push({ fen, move, parentFen, games: node.games });
    for (const child of node.children) {
      queue.push({ node: child, parentFen: fen });
    }
  }
  return out;
}

/**
 * Upsert all nodes for a project from a tree root. Call for both asWhite and asBlack.
 * parentIdMap: fen -> OpeningTreeNode id (so we can set parentNodeId for children).
 */
async function upsertNodes(
  projectId: string,
  root: OpeningNode,
  rootFen: string,
  parentIdMap: Map<string, string>,
): Promise<void> {
  const nodes = collectNodes(root, rootFen);
  for (const { fen, move, parentFen, games } of nodes) {
    const parentNodeId = parentFen ? (parentIdMap.get(parentFen) ?? null) : null;
    const created = await prisma.openingTreeNode.upsert({
      where: {
        projectId_fen: { projectId, fen },
      },
      create: {
        projectId,
        fen,
        move,
        parentNodeId,
        gamesCount: games,
        analysisStatus: ANALYSIS_STATUS_UNSCANNED,
      },
      update: {
        move,
        parentNodeId,
        gamesCount: games,
      },
    });
    parentIdMap.set(fen, created.id);
  }
}

/**
 * Merge DB node state (analysisStatus, riskScore, trapCount, lastAnalyzedAt, lastJobId)
 * into every node of the tree by FEN.
 */
function mergeNodeState(
  node: OpeningNode,
  stateByFen: Map<
    string,
    {
      analysisStatus: string;
      riskScore: number | null;
      trapCount: number;
      lastAnalyzedAt: Date | null;
      lastJobId: string | null;
    }
  >,
): void {
  const state = stateByFen.get(node.fen);
  if (state) {
    node.analysisStatus = state.analysisStatus as OpeningNode["analysisStatus"];
    node.riskScore = state.riskScore ?? undefined;
    node.trapCount = state.trapCount;
    node.lastAnalyzedAt = state.lastAnalyzedAt?.toISOString();
    node.lastJobId = state.lastJobId ?? undefined;
  }
  for (const child of node.children) {
    mergeNodeState(child, stateByFen);
  }
}

/**
 * Build opening repertoire from games, then materialize all nodes into OpeningTreeNode
 * for the project and merge DB state back into the trees.
 */
export async function materializeProjectTree(
  input: MaterializeInput,
): Promise<OpeningRepertoire> {
  const { projectId, games, timeClass } = input;
  const repertoire = buildOpeningRepertoire(games, timeClass ?? undefined);
  const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const parentIdMap = new Map<string, string>();

  await upsertNodes(projectId, repertoire.asWhite, startFen, parentIdMap);
  parentIdMap.clear();
  await upsertNodes(projectId, repertoire.asBlack, startFen, parentIdMap);

  const dbNodes = await prisma.openingTreeNode.findMany({
    where: { projectId },
  });
  const stateByFen = new Map(
    dbNodes.map((n) => [
      n.fen,
      {
        analysisStatus: n.analysisStatus,
        riskScore: n.riskScore,
        trapCount: n.trapCount,
        lastAnalyzedAt: n.lastAnalyzedAt,
        lastJobId: n.lastJobId,
      },
    ]),
  );
  mergeNodeState(repertoire.asWhite, stateByFen);
  mergeNodeState(repertoire.asBlack, stateByFen);

  return repertoire;
}
