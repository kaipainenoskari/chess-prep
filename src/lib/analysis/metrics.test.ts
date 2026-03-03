import { describe, it, expect } from "vitest";
import {
  computeMoveMargin,
  computeHumanErrorRate,
  computeUnnaturalScore,
  computeLineDifficulty,
  computeOpponentBranchingFactor,
  computePracticalLineScore,
  type EngineResultForMargin,
  type LineEngineMove,
  type LineHumanMove,
} from "./metrics";

describe("computeMoveMargin", () => {
  it("returns 0 when only one move", () => {
    const result: EngineResultForMargin = {
      bestMoves: [{ move: "e4", eval: 30 }],
    };
    expect(computeMoveMargin(result)).toBe(0);
  });

  it("returns eval(move2) - eval(move1)", () => {
    const result: EngineResultForMargin = {
      bestMoves: [
        { move: "e4", eval: 50 },
        { move: "c5", eval: 10 },
      ],
    };
    expect(computeMoveMargin(result)).toBe(-40);
  });

  it("returns 0 for empty bestMoves", () => {
    expect(computeMoveMargin({ bestMoves: [] })).toBe(0);
  });
});

describe("computeHumanErrorRate", () => {
  it("returns 0 when everyone played best move", () => {
    expect(
      computeHumanErrorRate("e4", [
        { move: "e4", games: 100 },
        { move: "c5", games: 0 },
      ]),
    ).toBe(0);
  });

  it("returns 1 when best move not in list", () => {
    expect(computeHumanErrorRate("e4", [{ move: "c5", games: 100 }])).toBe(1);
  });

  it("returns fraction of games that did not play best move", () => {
    expect(
      computeHumanErrorRate("e4", [
        { move: "e4", games: 60 },
        { move: "c5", games: 40 },
      ]),
    ).toBe(0.4);
  });

  it("is case-insensitive for move comparison", () => {
    expect(computeHumanErrorRate("E4", [{ move: "e4", games: 100 }])).toBe(0);
  });
});

describe("computeUnnaturalScore", () => {
  it("returns 0 (placeholder)", () => {
    expect(computeUnnaturalScore("Nf3")).toBe(0);
    expect(computeUnnaturalScore("e4", {})).toBe(0);
  });
});

describe("computeLineDifficulty", () => {
  it("returns 0 for empty lines", () => {
    expect(computeLineDifficulty([], [])).toBe(0);
  });

  it("returns numeric score for single-move line", () => {
    const engine: LineEngineMove[] = [{ move: "e4", eval: 30 }];
    const human: LineHumanMove[] = [{ move: "e4", games: 100, winrate: 0.6 }];
    const score = computeLineDifficulty(engine, human);
    expect(typeof score).toBe("number");
    expect(Number.isFinite(score)).toBe(true);
  });

  it("aggregates over multiple moves", () => {
    const engine: LineEngineMove[] = [
      { move: "e4", eval: 30 },
      { move: "c5", eval: 10 },
    ];
    const human: LineHumanMove[] = [
      { move: "e4", games: 100, winrate: 0.7 },
      { move: "c5", games: 80, winrate: 0.5 },
    ];
    const score = computeLineDifficulty(engine, human);
    expect(score).toBeGreaterThan(0);
  });

  it("adds opponent probability and subtracts branching penalty when options given", () => {
    const engine: LineEngineMove[] = [{ move: "e4", eval: 30 }];
    const human: LineHumanMove[] = [{ move: "e4", games: 100, winrate: 0.5 }];
    const base = computeLineDifficulty(engine, human);
    const withOpts = computeLineDifficulty(engine, human, {
      opponentProbabilityProduct: 0.5,
      opponentBranchingFactor: 2,
    });
    expect(withOpts).toBeCloseTo(base + 0.5 * 20 - 2 * 10, 1);
  });
});

describe("computeOpponentBranchingFactor", () => {
  it("returns 0 when each step has one plausible move", () => {
    const dists = [
      [{ move: "e7e5", probability: 1 }],
      [{ move: "g8f6", probability: 0.9 }],
    ];
    expect(computeOpponentBranchingFactor(dists, 0.05)).toBe(0);
  });

  it("returns sum of (plausible count - 1) per step", () => {
    const dists = [
      [
        { move: "e7e5", probability: 0.5 },
        { move: "c7c5", probability: 0.3 },
        { move: "e7e6", probability: 0.02 },
      ],
    ];
    expect(computeOpponentBranchingFactor(dists, 0.05)).toBe(1);
    const twoSteps = [
      [
        { move: "e7e5", probability: 0.6 },
        { move: "c7c5", probability: 0.4 },
      ],
      [
        { move: "g8f6", probability: 0.7 },
        { move: "d7d6", probability: 0.2 },
      ],
    ];
    expect(computeOpponentBranchingFactor(twoSteps, 0.05)).toBe(2);
  });

  it("ignores moves below threshold", () => {
    const dists = [
      [
        { move: "e7e5", probability: 0.6 },
        { move: "c7c5", probability: 0.03 },
      ],
    ];
    expect(computeOpponentBranchingFactor(dists, 0.05)).toBe(0);
  });
});

describe("computePracticalLineScore", () => {
  it("returns entryProbability * 0.5 when lineHuman is empty", () => {
    expect(computePracticalLineScore([], 0.8, "white")).toBe(0.4);
  });

  it("when preparer (white) made last move: uses that winrate", () => {
    const lineHuman: LineHumanMove[] = [
      { move: "e4", games: 100, winrate: 0.55 },
      { move: "e5", games: 80, winrate: 0.48 },
      { move: "Nf3", games: 60, winrate: 0.62 },
    ];
    expect(computePracticalLineScore(lineHuman, 1, "white")).toBe(0.62);
    expect(computePracticalLineScore(lineHuman, 0.5, "white")).toBe(0.31);
  });

  it("when opponent made last move: uses 1 - winrate for preparer perspective", () => {
    const lineHuman: LineHumanMove[] = [
      { move: "e4", games: 100, winrate: 0.55 },
      { move: "e5", games: 80, winrate: 0.48 },
    ];
    expect(computePracticalLineScore(lineHuman, 1, "white")).toBe(0.52);
  });

  it("rounds to 3 decimal places", () => {
    const lineHuman: LineHumanMove[] = [{ move: "e4", games: 100, winrate: 0.666 }];
    expect(computePracticalLineScore(lineHuman, 0.333, "white")).toBe(0.222);
  });
});
