import { describe, it, expect } from "vitest";
import { buildOpeningRepertoire, findWeakLines, findStrongLines } from "./openings";
import type { ParsedGame } from "../types";

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
