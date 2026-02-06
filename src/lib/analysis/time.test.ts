import { describe, it, expect } from "vitest";
import { analyzeTimeManagement } from "./time";
import type { ParsedGame } from "../types";

function makeGame(overrides: Partial<ParsedGame>): ParsedGame {
  return {
    url: "",
    uuid: "uuid-1",
    playerColor: "white",
    opponentUsername: "opp",
    playerRating: 1500,
    opponentRating: 1500,
    result: "win",
    resultDetail: "win",
    timeClass: "blitz",
    timeControl: "180+0",
    eco: "",
    openingName: "",
    moves: ["e4", "e5", "Nf3", "Nc6"],
    clocks: [178, 178, 170, 170, 150, 150, 100, 100],
    numMoves: 4,
    endTime: 1700000000,
    fen: "",
    ...overrides,
  };
}

describe("analyzeTimeManagement", () => {
  it("returns empty profile when no games have clocks", () => {
    const games = [makeGame({ clocks: [] })];
    const profile = analyzeTimeManagement(games);
    expect(profile.troubleStats.totalGames).toBe(0);
    expect(profile.avgClockByMove).toEqual([]);
  });

  it("detects time trouble", () => {
    // Player's clocks (white): 178, 170, 150, 25 => below 30 on last move
    const games = [
      makeGame({
        clocks: [178, 178, 170, 170, 150, 150, 25, 100],
        result: "loss",
      }),
    ];
    const profile = analyzeTimeManagement(games);
    expect(profile.troubleStats.below30s).toBe(1);
  });

  it("detects flagging", () => {
    const games = [
      makeGame({
        clocks: [178, 178, 100, 170, 20, 150, 5, 100],
        result: "loss",
        resultDetail: "timeout",
      }),
    ];
    const profile = analyzeTimeManagement(games);
    expect(profile.troubleStats.flagged).toBe(1);
  });

  it("filters by time class", () => {
    const games = [makeGame({ timeClass: "blitz" }), makeGame({ timeClass: "rapid" })];
    const profile = analyzeTimeManagement(games, "blitz");
    expect(profile.troubleStats.totalGames).toBe(1);
  });

  it("computes time allocation by phase", () => {
    const profile = analyzeTimeManagement([makeGame({})]);
    expect(profile.timeAllocation.length).toBe(3);
    const total = profile.timeAllocation.reduce((s, a) => s + a.percentage, 0);
    // Should sum close to 100 (rounding may cause ±1)
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });
});
