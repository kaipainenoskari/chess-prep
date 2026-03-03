import { describe, it, expect } from "vitest";
import { detectWeaknesses } from "./weaknesses";
import { buildOpeningRepertoire } from "./openings";
import { analyzeTimeManagement } from "./time";
import type { PerformanceStats } from "./performance";

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
  it("returns empty weaknesses and strengths (detection disabled)", () => {
    const perf = makePerf();
    const openings = buildOpeningRepertoire([]);
    const time = analyzeTimeManagement([]);
    const { weaknesses, strengths } = detectWeaknesses(perf, openings, time);
    expect(Array.isArray(weaknesses)).toBe(true);
    expect(Array.isArray(strengths)).toBe(true);
    expect(weaknesses).toHaveLength(0);
    expect(strengths).toHaveLength(0);
  });
});
