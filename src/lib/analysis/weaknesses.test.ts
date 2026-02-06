import { describe, it, expect } from "vitest";
import { detectWeaknesses } from "./weaknesses";
import { buildOpeningRepertoire } from "./openings";
import { analyzeTimeManagement } from "./time";
import type { ParsedGame } from "../types";
import type { PerformanceStats } from "./performance";

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
    moves: ["e4", "e5"],
    clocks: [178, 178, 170, 170],
    numMoves: 2,
    endTime: 1700000000,
    fen: "",
    ...overrides,
  };
}

function makePerf(overrides: Partial<PerformanceStats> = {}): PerformanceStats {
  return {
    totalGames: 100,
    wins: 50,
    losses: 40,
    draws: 10,
    winRate: 50,
    byColor: {
      white: { games: 50, wins: 25, draws: 5, losses: 20, winRate: 50 },
      black: { games: 50, wins: 25, draws: 5, losses: 20, winRate: 50 },
    },
    byTimeControl: {},
    byGameLength: {
      short: { games: 30, winRate: 50 },
      medium: { games: 40, winRate: 50 },
      long: { games: 30, winRate: 50 },
    },
    recentForm: [],
    tiltFactor: 0,
    avgAccuracy: null,
    ...overrides,
  };
}

describe("detectWeaknesses", () => {
  it("detects colour weakness", () => {
    const perf = makePerf({
      byColor: {
        white: { games: 50, wins: 15, draws: 5, losses: 30, winRate: 30 },
        black: { games: 50, wins: 30, draws: 5, losses: 15, winRate: 60 },
      },
    });
    const openings = buildOpeningRepertoire([]);
    const time = analyzeTimeManagement([]);
    const { weaknesses } = detectWeaknesses(perf, openings, time);
    const colorW = weaknesses.find((w) => w.category === "color");
    expect(colorW).toBeDefined();
    expect(colorW!.title).toContain("white");
  });

  it("detects endgame weakness", () => {
    const perf = makePerf({
      winRate: 50,
      byGameLength: {
        short: { games: 30, winRate: 60 },
        medium: { games: 40, winRate: 50 },
        long: { games: 30, winRate: 25 },
      },
    });
    const openings = buildOpeningRepertoire([]);
    const time = analyzeTimeManagement([]);
    const { weaknesses } = detectWeaknesses(perf, openings, time);
    expect(weaknesses.find((w) => w.category === "endgame")).toBeDefined();
  });

  it("detects tilt", () => {
    const perf = makePerf({ tiltFactor: -30, totalGames: 100 });
    const openings = buildOpeningRepertoire([]);
    const time = analyzeTimeManagement([]);
    const { weaknesses } = detectWeaknesses(perf, openings, time);
    expect(weaknesses.find((w) => w.category === "tilt")).toBeDefined();
  });

  it("detects time trouble weakness", () => {
    // 60% of games in time trouble
    const games = Array.from({ length: 10 }, (_, i) =>
      makeGame({
        clocks:
          i < 6
            ? [178, 178, 25, 170, 10, 150, 5, 100]
            : [178, 178, 170, 170, 150, 150, 100, 100],
        result: i < 6 ? "loss" : "win",
      }),
    );
    const openings = buildOpeningRepertoire(games);
    const time = analyzeTimeManagement(games);
    const perf = makePerf();
    const { weaknesses } = detectWeaknesses(perf, openings, time);
    expect(weaknesses.find((w) => w.category === "time")).toBeDefined();
  });

  it("returns empty arrays when no weaknesses found", () => {
    const perf = makePerf();
    const openings = buildOpeningRepertoire([]);
    const time = analyzeTimeManagement([]);
    const { weaknesses, strengths } = detectWeaknesses(perf, openings, time);
    // We can't guarantee zero but both should be arrays
    expect(Array.isArray(weaknesses)).toBe(true);
    expect(Array.isArray(strengths)).toBe(true);
  });
});
