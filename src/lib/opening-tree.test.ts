import { describe, it, expect } from "vitest";
import {
  START_FEN,
  getNodeAtPath,
  getNodesAlongPath,
  formatMoveLabel,
  childMovesToArrows,
  getRepertoireMoves,
} from "./opening-tree";
import type { OpeningNode } from "./types";

function makeNode(move: string, children: OpeningNode[] = []): OpeningNode {
  return {
    move,
    fen: `fen-after-${move}`,
    games: 10,
    wins: 5,
    draws: 3,
    losses: 2,
    winRate: 0.5,
    children,
  };
}

// Build a small tree:
//   root
//   ├── e4
//   │   ├── e5
//   │   └── c5
//   └── d4
//       └── d5
function makeTree(): OpeningNode {
  return makeNode("root", [
    makeNode("e4", [makeNode("e5"), makeNode("c5")]),
    makeNode("d4", [makeNode("d5")]),
  ]);
}

describe("START_FEN", () => {
  it("is the standard starting position", () => {
    expect(START_FEN).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  });
});

describe("getNodeAtPath", () => {
  const tree = makeTree();

  it("returns the root when path is empty", () => {
    expect(getNodeAtPath(tree, [])).toBe(tree);
  });

  it("navigates one level deep", () => {
    const node = getNodeAtPath(tree, [0]);
    expect(node.move).toBe("e4");
  });

  it("navigates two levels deep", () => {
    const node = getNodeAtPath(tree, [0, 1]);
    expect(node.move).toBe("c5");
  });

  it("navigates a different branch", () => {
    const node = getNodeAtPath(tree, [1, 0]);
    expect(node.move).toBe("d5");
  });
});

describe("getNodesAlongPath", () => {
  const tree = makeTree();

  it("returns empty array for empty path", () => {
    expect(getNodesAlongPath(tree, [])).toEqual([]);
  });

  it("returns all nodes along a single-step path", () => {
    const nodes = getNodesAlongPath(tree, [0]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].move).toBe("e4");
  });

  it("returns all nodes along a multi-step path", () => {
    const nodes = getNodesAlongPath(tree, [0, 1]);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].move).toBe("e4");
    expect(nodes[1].move).toBe("c5");
  });

  it("does not include the root node", () => {
    const nodes = getNodesAlongPath(tree, [1, 0]);
    expect(nodes.every((n) => n.move !== "root")).toBe(true);
  });
});

describe("formatMoveLabel", () => {
  it("formats white's first move", () => {
    expect(formatMoveLabel("e4", 0)).toBe("1. e4");
  });

  it("formats black's first move", () => {
    expect(formatMoveLabel("e5", 1)).toBe("1\u2026e5");
  });

  it("formats white's second move", () => {
    expect(formatMoveLabel("Nf3", 2)).toBe("2. Nf3");
  });

  it("formats black's second move", () => {
    expect(formatMoveLabel("Nc6", 3)).toBe("2\u2026Nc6");
  });

  it("formats later moves correctly", () => {
    expect(formatMoveLabel("O-O", 8)).toBe("5. O-O");
    expect(formatMoveLabel("Bxf7", 9)).toBe("5\u2026Bxf7");
  });
});

// Helpers for arrow / legal-move tests: nodes need real FENs
function makeRealNode(
  move: string,
  fen: string,
  games: number,
  children: OpeningNode[] = [],
): OpeningNode {
  return {
    move,
    fen,
    games,
    wins: Math.floor(games / 2),
    draws: 0,
    losses: games - Math.floor(games / 2),
    winRate: 0.5,
    children,
  };
}

describe("childMovesToArrows", () => {
  it("returns empty array for no children", () => {
    expect(childMovesToArrows(START_FEN, [])).toEqual([]);
  });

  it("returns arrows with from/to squares for each child", () => {
    const children = [makeRealNode("e4", "", 8), makeRealNode("d4", "", 2)];
    const arrows = childMovesToArrows(START_FEN, children);
    expect(arrows).toHaveLength(2);

    // e2-e4 arrow
    expect(arrows[0][0]).toBe("e2");
    expect(arrows[0][1]).toBe("e4");

    // d2-d4 arrow
    expect(arrows[1][0]).toBe("d2");
    expect(arrows[1][1]).toBe("d4");
  });

  it("scales opacity by frequency", () => {
    const children = [makeRealNode("e4", "", 9), makeRealNode("d4", "", 1)];
    const arrows = childMovesToArrows(START_FEN, children);

    // Most played (90%) should have higher opacity than least played (10%)
    const opacityOf = (arrow: [string, string, string]) => {
      const match = arrow[2].match(/[\d.]+\)$/);
      return match ? parseFloat(match[0]) : 0;
    };

    expect(opacityOf(arrows[0])).toBeGreaterThan(opacityOf(arrows[1]));
  });

  it("skips invalid moves gracefully", () => {
    const children = [makeRealNode("e4", "", 5), makeRealNode("INVALID", "", 3)];
    const arrows = childMovesToArrows(START_FEN, children);
    expect(arrows).toHaveLength(1);
    expect(arrows[0][0]).toBe("e2");
  });
});

describe("getRepertoireMoves", () => {
  it("returns empty array when piece has no repertoire moves", () => {
    const children = [makeRealNode("e4", "", 5)];
    // Asking about d1 (queen) — Qd2, Qd3 etc are not in children
    const moves = getRepertoireMoves(START_FEN, "d1", children);
    expect(moves).toEqual([]);
  });

  it("returns matching destinations for a piece with repertoire moves", () => {
    const children = [makeRealNode("e4", "", 8), makeRealNode("d4", "", 2)];
    // e2 pawn can play e3 or e4; only e4 is in repertoire
    const moves = getRepertoireMoves(START_FEN, "e2", children);
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toBe("e4");
    expect(moves[0].childIndex).toBe(0);
  });

  it("returns empty array for empty square", () => {
    const children = [makeRealNode("e4", "", 5)];
    const moves = getRepertoireMoves(START_FEN, "e4", children);
    expect(moves).toEqual([]);
  });
});
