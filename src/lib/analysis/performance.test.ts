import { describe, it, expect } from "vitest";
import { analyzePerformance } from "./performance";
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
    moves: [],
    clocks: [],
    numMoves: 20,
    endTime: 1700000000,
    fen: "",
    ...overrides,
  };
}

describe("analyzePerformance", () => {
  it("counts wins, losses, draws", () => {
    const games = [
      makeGame({ result: "win" }),
      makeGame({ result: "loss" }),
      makeGame({ result: "draw" }),
    ];
    const perf = analyzePerformance(games);
    expect(perf.wins).toBe(1);
    expect(perf.losses).toBe(1);
    expect(perf.draws).toBe(1);
    expect(perf.totalGames).toBe(3);
  });

  it("computes win rate correctly", () => {
    const games = [
      makeGame({ result: "win" }),
      makeGame({ result: "win" }),
      makeGame({ result: "loss" }),
      makeGame({ result: "loss" }),
    ];
    const perf = analyzePerformance(games);
    expect(perf.winRate).toBe(50);
  });

  it("breaks down by colour", () => {
    const games = [
      makeGame({ playerColor: "white", result: "win" }),
      makeGame({ playerColor: "white", result: "win" }),
      makeGame({ playerColor: "black", result: "loss" }),
    ];
    const perf = analyzePerformance(games);
    expect(perf.byColor.white.winRate).toBe(100);
    expect(perf.byColor.black.winRate).toBe(0);
  });

  it("computes recent form", () => {
    const games = Array.from({ length: 25 }, (_, i) =>
      makeGame({
        result: i % 2 === 0 ? "win" : "loss",
        endTime: 1700000000 + i,
      }),
    );
    const perf = analyzePerformance(games);
    expect(perf.recentForm.length).toBe(20);
  });

  it("computes tilt factor", () => {
    // Alternating: loss then loss again (tilt pattern)
    const games = [
      makeGame({ result: "win", endTime: 1 }),
      makeGame({ result: "loss", endTime: 2 }),
      makeGame({ result: "loss", endTime: 3 }),
      makeGame({ result: "loss", endTime: 4 }),
      makeGame({ result: "win", endTime: 5 }),
      makeGame({ result: "loss", endTime: 6 }),
      makeGame({ result: "loss", endTime: 7 }),
    ];
    const perf = analyzePerformance(games);
    // tiltFactor should be negative (worse after losses)
    expect(perf.tiltFactor).toBeLessThanOrEqual(0);
  });

  it("filters by time class", () => {
    const games = [makeGame({ timeClass: "blitz" }), makeGame({ timeClass: "rapid" })];
    const perf = analyzePerformance(games, "blitz");
    expect(perf.totalGames).toBe(1);
  });

  it("classifies game length buckets", () => {
    const games = [
      makeGame({ numMoves: 15, result: "win" }),
      makeGame({ numMoves: 30, result: "loss" }),
      makeGame({ numMoves: 50, result: "draw" }),
    ];
    const perf = analyzePerformance(games);
    expect(perf.byGameLength.short.games).toBe(1);
    expect(perf.byGameLength.medium.games).toBe(1);
    expect(perf.byGameLength.long.games).toBe(1);
  });
});
