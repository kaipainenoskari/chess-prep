import { describe, it, expect } from "vitest";
import {
  buildOpeningRepertoire,
  findWeakLines,
  findStrongLines,
  normalizeFen,
  mergeTranspositions,
} from "./openings";
import type { ParsedGame, OpeningNode } from "../types";

function makeGame(overrides: Partial<ParsedGame>): ParsedGame {
  return {
    url: "https://chess.com/game/1",
    uuid: "uuid-1",
    playerColor: "white",
    opponentUsername: "opp",
    playerRating: 1500,
    opponentRating: 1500,
    result: "win",
    resultDetail: "win",
    timeClass: "blitz",
    timeControl: "180+0",
    eco: "B20",
    openingName: "Sicilian",
    moves: ["e4", "c5", "Nf3"],
    clocks: [],
    numMoves: 2,
    endTime: 1700000000,
    fen: "",
    ...overrides,
  };
}

describe("buildOpeningRepertoire", () => {
  it("creates separate trees for white and black", () => {
    const games = [
      makeGame({ playerColor: "white", moves: ["e4", "e5"], result: "win" }),
      makeGame({ playerColor: "black", moves: ["d4", "Nf6"], result: "loss" }),
    ];

    const rep = buildOpeningRepertoire(games);
    expect(rep.asWhite.games).toBe(1);
    expect(rep.asBlack.games).toBe(1);
  });

  it("accumulates move stats", () => {
    const games = [
      makeGame({ moves: ["e4", "e5"], result: "win" }),
      makeGame({ moves: ["e4", "c5"], result: "loss" }),
      makeGame({ moves: ["d4", "d5"], result: "draw" }),
    ];

    const rep = buildOpeningRepertoire(games);
    expect(rep.asWhite.games).toBe(3);
    // e4 node
    const e4 = rep.asWhite.children.find((c) => c.move === "e4");
    expect(e4).toBeDefined();
    expect(e4!.games).toBe(2);
    expect(e4!.wins).toBe(1);
    expect(e4!.losses).toBe(1);
  });

  it("filters by time class", () => {
    const games = [
      makeGame({ timeClass: "blitz", moves: ["e4"], result: "win" }),
      makeGame({ timeClass: "rapid", moves: ["d4"], result: "win" }),
    ];

    const rep = buildOpeningRepertoire(games, "blitz");
    expect(rep.asWhite.games).toBe(1);
  });

  it("returns empty trees for no games", () => {
    const rep = buildOpeningRepertoire([]);
    expect(rep.asWhite.games).toBe(0);
    expect(rep.asBlack.games).toBe(0);
  });
});

describe("findWeakLines / findStrongLines", () => {
  it("finds weak lines below threshold", () => {
    const games = Array.from({ length: 5 }, () =>
      makeGame({ moves: ["e4", "e5"], result: "loss" }),
    );
    const rep = buildOpeningRepertoire(games);
    const weak = findWeakLines(rep.asWhite, 3);
    expect(weak.length).toBeGreaterThan(0);
    expect(weak[0].winRate).toBe(0);
  });

  it("finds strong lines above threshold", () => {
    const games = Array.from({ length: 5 }, () =>
      makeGame({ moves: ["e4", "e5"], result: "win" }),
    );
    const rep = buildOpeningRepertoire(games);
    const strong = findStrongLines(rep.asWhite, 3);
    expect(strong.length).toBeGreaterThan(0);
    expect(strong[0].winRate).toBe(1);
  });

  it("respects minGames", () => {
    const games = [
      makeGame({ moves: ["e4"], result: "loss" }),
      makeGame({ moves: ["e4"], result: "loss" }),
    ];
    const rep = buildOpeningRepertoire(games);
    const weak = findWeakLines(rep.asWhite, 5);
    expect(weak.length).toBe(0);
  });
});

describe("normalizeFen", () => {
  it("strips halfmove clock and fullmove number", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    expect(normalizeFen(fen)).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3",
    );
  });

  it("makes FENs from different move counts equal", () => {
    const fen1 = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1";
    const fen2 = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 3";
    expect(normalizeFen(fen1)).toBe(normalizeFen(fen2));
  });
});

describe("mergeTranspositions", () => {
  it("annotates nodes when the same FEN appears in different branches", () => {
    // Simulate two branches reaching the same position:
    // Branch 1: 1.d4 Nf6 2.c4 (3 wins)
    // Branch 2: 1.c4 Nf6 2.d4 (2 losses)
    // The position after 2.c4 and 2.d4 is identical.
    const games = [
      // Branch 1: d4 Nf6 c4
      makeGame({ moves: ["d4", "Nf6", "c4"], result: "win" }),
      makeGame({ moves: ["d4", "Nf6", "c4"], result: "win" }),
      makeGame({ moves: ["d4", "Nf6", "c4"], result: "win" }),
      // Branch 2: c4 Nf6 d4
      makeGame({ moves: ["c4", "Nf6", "d4"], result: "loss" }),
      makeGame({ moves: ["c4", "Nf6", "d4"], result: "loss" }),
    ];

    const rep = buildOpeningRepertoire(games);

    // Find the c4 node under d4 -> Nf6
    const d4 = rep.asWhite.children.find((c) => c.move === "d4")!;
    const nf6UnderD4 = d4.children.find((c) => c.move === "Nf6")!;
    const c4UnderD4Nf6 = nf6UnderD4.children.find((c) => c.move === "c4")!;

    // Find the d4 node under c4 -> Nf6
    const c4 = rep.asWhite.children.find((c) => c.move === "c4")!;
    const nf6UnderC4 = c4.children.find((c) => c.move === "Nf6")!;
    const d4UnderC4Nf6 = nf6UnderC4.children.find((c) => c.move === "d4")!;

    // Both reach the same position, so merged stats should combine
    expect(c4UnderD4Nf6.games).toBe(3); // direct
    expect(c4UnderD4Nf6.mergedGames).toBe(5); // 3 + 2 from transposition

    expect(d4UnderC4Nf6.games).toBe(2); // direct
    expect(d4UnderC4Nf6.mergedGames).toBe(5); // 2 + 3 from transposition
  });

  it("does not annotate nodes without transpositions", () => {
    const games = [
      makeGame({ moves: ["e4", "e5"], result: "win" }),
      makeGame({ moves: ["e4", "e5"], result: "win" }),
    ];

    const rep = buildOpeningRepertoire(games);
    const e4 = rep.asWhite.children.find((c) => c.move === "e4")!;
    expect(e4.mergedGames).toBeUndefined();
  });

  it("works on a manually constructed tree", () => {
    const sharedFen = "rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2";
    const root: OpeningNode = {
      move: "root",
      fen: "",
      games: 5,
      wins: 3,
      draws: 0,
      losses: 2,
      winRate: 0.6,
      children: [
        {
          move: "d4",
          fen: "fen-d4",
          games: 3,
          wins: 2,
          draws: 0,
          losses: 1,
          winRate: 0.67,
          children: [
            {
              move: "c4",
              fen: sharedFen,
              games: 3,
              wins: 2,
              draws: 0,
              losses: 1,
              winRate: 0.67,
              children: [],
            },
          ],
        },
        {
          move: "c4",
          fen: "fen-c4",
          games: 2,
          wins: 1,
          draws: 0,
          losses: 1,
          winRate: 0.5,
          children: [
            {
              move: "d4",
              fen: sharedFen,
              games: 2,
              wins: 1,
              draws: 0,
              losses: 1,
              winRate: 0.5,
              children: [],
            },
          ],
        },
      ],
    };

    mergeTranspositions(root);

    const branchA = root.children[0].children[0];
    const branchB = root.children[1].children[0];

    expect(branchA.mergedGames).toBe(5);
    expect(branchA.mergedWinRate).toBe(0.6);
    expect(branchB.mergedGames).toBe(5);
    expect(branchB.mergedWinRate).toBe(0.6);
  });
});
