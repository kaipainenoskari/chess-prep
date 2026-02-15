import { describe, it, expect } from "vitest";
import { isTrapNode } from "../trapDetection";
import type { EngineAnalysisResult } from "@/lib/engine/types";

function engineResult(
  moves: Array<{ move: string; eval: number }>,
): EngineAnalysisResult {
  return { bestMoves: moves.map((m) => ({ ...m, pv: [m.move] })) };
}

describe("isTrapNode", () => {
  it("returns isTrap true and all metrics when all thresholds pass (perfect trap)", () => {
    const engineResult_ = engineResult([
      { move: "e7e5", eval: 50 },
      { move: "c7c5", eval: -250 },
    ]);
    const moveDistribution = [
      { move: "e7e5", probability: 0.5 },
      { move: "c7c5", probability: 0.5 },
    ];
    const result = isTrapNode({
      engineResult: engineResult_,
      moveDistribution,
      entryProbability: 0.1,
    });
    expect(result.metrics.marginCp).toBe(-250 - 50);
    expect(result.metrics.narrowness).toBe(1);
    expect(result.metrics.pDeviate).toBe(0.5);
    expect(result.metrics.expectedMistakeCp).toBe(0.5 * 300);
    expect(result.metrics.expectedSwing).toBe(0.5 * 300);
    expect(result.metrics.pWinningAfterMistake).toBe(0.5);
    expect(result.isTrap).toBe(true);
  });

  it("returns isTrap false when narrow but opponent always plays best (pDeviate 0)", () => {
    const engineResult_ = engineResult([
      { move: "e7e5", eval: 50 },
      { move: "c7c5", eval: -100 },
    ]);
    const moveDistribution = [{ move: "e7e5", probability: 1 }];
    const result = isTrapNode({
      engineResult: engineResult_,
      moveDistribution,
      entryProbability: 0.5,
    });
    expect(result.metrics.pDeviate).toBe(0);
    expect(result.metrics.narrowness).toBe(1);
    expect(result.isTrap).toBe(false);
  });

  it("returns isTrap false when entryProbability below minimum", () => {
    const engineResult_ = engineResult([
      { move: "e7e5", eval: 50 },
      { move: "c7c5", eval: -250 },
    ]);
    const moveDistribution = [
      { move: "e7e5", probability: 0.5 },
      { move: "c7c5", probability: 0.5 },
    ];
    const result = isTrapNode({
      engineResult: engineResult_,
      moveDistribution,
      entryProbability: 0.01,
    });
    expect(result.metrics.expectedSwing).toBeGreaterThanOrEqual(80);
    expect(result.metrics.pWinningAfterMistake).toBe(0.5);
    expect(0.01).toBeLessThan(0.02);
    expect(result.isTrap).toBe(false);
  });

  it("returns metrics even when isTrap is false", () => {
    const engineResult_ = engineResult([{ move: "e7e5", eval: 50 }]);
    const moveDistribution = [{ move: "e7e5", probability: 1 }];
    const result = isTrapNode({
      engineResult: engineResult_,
      moveDistribution,
      entryProbability: 0,
    });
    expect(result.isTrap).toBe(false);
    expect(result.metrics).toEqual({
      marginCp: 500,
      narrowness: 1,
      pDeviate: 0,
      expectedMistakeCp: 0,
      expectedSwing: 0,
      pWinningAfterMistake: 0,
    });
  });

  it("handles move in distribution not in multipv (uses default eval drop)", () => {
    const engineResult_ = engineResult([{ move: "e7e5", eval: 50 }]);
    const moveDistribution = [
      { move: "e7e5", probability: 0.3 },
      { move: "g8f6", probability: 0.7 },
    ];
    const result = isTrapNode({
      engineResult: engineResult_,
      moveDistribution,
      entryProbability: 0.05,
    });
    expect(result.metrics.pDeviate).toBe(0.7);
    expect(result.metrics.expectedMistakeCp).toBe(0.7 * 100);
    expect(result.metrics.pWinningAfterMistake).toBe(0);
    expect(result.isTrap).toBe(false);
  });

  it("handles empty bestMoves", () => {
    const result = isTrapNode({
      engineResult: { bestMoves: [] },
      moveDistribution: [{ move: "e7e5", probability: 1 }],
      entryProbability: 0.5,
    });
    expect(result.metrics.marginCp).toBe(500);
    expect(result.metrics.narrowness).toBe(0);
    expect(result.isTrap).toBe(false);
  });
});
