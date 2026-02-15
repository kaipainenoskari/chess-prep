import { describe, it, expect } from "vitest";
import {
  marginCp,
  nNearBest,
  narrowness,
  forcingAfterPreparerMove,
  probabilityBestMove,
  probabilityDeviate,
  expectedMistakeCp,
  expectedEvalSwing,
  probabilityWinningAfterMistake,
  earlyBonus,
} from "../trapMetrics";
import { ONLY_MOVE_MARGIN_CP } from "@/lib/config";
import type { EngineAnalysisResult } from "@/lib/engine/types";

function engineResult(
  moves: Array<{ move: string; eval: number }>,
): EngineAnalysisResult {
  return { bestMoves: moves.map((m) => ({ ...m, pv: [m.move] })) };
}

describe("marginCp", () => {
  it("returns ONLY_MOVE_MARGIN_CP when only one move", () => {
    const result = engineResult([{ move: "e2e4", eval: 30 }]);
    expect(marginCp(result)).toBe(ONLY_MOVE_MARGIN_CP);
  });

  it("returns second.eval - first.eval when two moves", () => {
    const result = engineResult([
      { move: "e2e4", eval: 50 },
      { move: "c7c5", eval: 10 },
    ]);
    expect(marginCp(result)).toBe(10 - 50);
  });

  it("returns only-move constant for empty bestMoves", () => {
    expect(marginCp({ bestMoves: [] })).toBe(ONLY_MOVE_MARGIN_CP);
  });
});

describe("nNearBest", () => {
  it("returns 1 for only-move scenario", () => {
    const result = engineResult([{ move: "e2e4", eval: 100 }]);
    expect(nNearBest(result, 50)).toBe(1);
  });

  it("counts moves within threshold of best", () => {
    const result = engineResult([
      { move: "a", eval: 100 },
      { move: "b", eval: 80 },
      { move: "c", eval: 60 },
      { move: "d", eval: 40 },
    ]);
    expect(nNearBest(result, 50)).toBe(3);
  });

  it("returns 0 for empty bestMoves", () => {
    expect(nNearBest({ bestMoves: [] }, 50)).toBe(0);
  });
});

describe("narrowness", () => {
  it("returns 1 when only one move", () => {
    const result = engineResult([{ move: "e2e4", eval: 100 }]);
    expect(narrowness(result, 50)).toBe(1);
  });

  it("returns 1/n when n moves within threshold", () => {
    const result = engineResult([
      { move: "a", eval: 100 },
      { move: "b", eval: 80 },
      { move: "c", eval: 60 },
    ]);
    expect(narrowness(result, 50)).toBeCloseTo(1 / 3);
  });

  it("returns 0 when no moves (nNearBest 0)", () => {
    expect(narrowness({ bestMoves: [] }, 50)).toBe(0);
  });
});

describe("forcingAfterPreparerMove", () => {
  it("equals marginCp at position after preparer move", () => {
    const afterMove = engineResult([
      { move: "e7e5", eval: 20 },
      { move: "c7c5", eval: -20 },
    ]);
    expect(forcingAfterPreparerMove(afterMove)).toBe(marginCp(afterMove));
    expect(forcingAfterPreparerMove(afterMove)).toBe(-20 - 20);
  });
});

describe("probabilityBestMove", () => {
  it("returns 1 when opponent always plays best", () => {
    const result = engineResult([{ move: "e7e5", eval: 50 }]);
    const dist = [{ move: "e7e5", probability: 1 }];
    expect(probabilityBestMove(result, dist)).toBe(1);
  });

  it("returns 0 when best move not in distribution", () => {
    const result = engineResult([{ move: "e7e5", eval: 50 }]);
    const dist = [{ move: "c7c5", probability: 1 }];
    expect(probabilityBestMove(result, dist)).toBe(0);
  });

  it("returns probability of best move when multiple in dist", () => {
    const result = engineResult([{ move: "e7e5", eval: 50 }]);
    const dist = [
      { move: "e7e5", probability: 0.6 },
      { move: "c7c5", probability: 0.4 },
    ];
    expect(probabilityBestMove(result, dist)).toBe(0.6);
  });

  it("is case-insensitive for move comparison", () => {
    const result = engineResult([{ move: "E7E5", eval: 50 }]);
    const dist = [{ move: "e7e5", probability: 1 }];
    expect(probabilityBestMove(result, dist)).toBe(1);
  });
});

describe("probabilityDeviate", () => {
  it("returns 0 when opponent always plays best", () => {
    const result = engineResult([{ move: "e7e5", eval: 50 }]);
    const dist = [{ move: "e7e5", probability: 1 }];
    expect(probabilityDeviate(result, dist)).toBe(0);
  });

  it("returns 1 when opponent never plays best", () => {
    const result = engineResult([{ move: "e7e5", eval: 50 }]);
    const dist = [{ move: "c7c5", probability: 1 }];
    expect(probabilityDeviate(result, dist)).toBe(1);
  });
});

describe("expectedMistakeCp / expectedEvalSwing", () => {
  it("returns 0 when opponent always plays best", () => {
    const result = engineResult([
      { move: "e7e5", eval: 50 },
      { move: "c7c5", eval: -100 },
    ]);
    const dist = [{ move: "e7e5", probability: 1 }];
    expect(expectedMistakeCp(result, dist)).toBe(0);
    expect(expectedEvalSwing(result, dist)).toBe(0);
  });

  it("returns positive when opponent plays worse move", () => {
    const result = engineResult([
      { move: "e7e5", eval: 50 },
      { move: "c7c5", eval: -100 },
    ]);
    const dist = [
      { move: "e7e5", probability: 0.6 },
      { move: "c7c5", probability: 0.4 },
    ];
    const expected = 0.4 * (50 - -100);
    expect(expectedMistakeCp(result, dist)).toBe(expected);
    expect(expectedEvalSwing(result, dist)).toBe(expected);
  });

  it("uses bestEval - 100 for move not in multipv", () => {
    const result = engineResult([
      { move: "e7e5", eval: 50 },
      { move: "c7c5", eval: -100 },
    ]);
    const dist = [
      { move: "e7e5", probability: 0.5 },
      { move: "g8f6", probability: 0.5 },
    ];
    expect(expectedMistakeCp(result, dist)).toBe(
      0.5 * 0 + 0.5 * Math.max(0, 50 - (50 - 100)),
    );
    expect(expectedMistakeCp(result, dist)).toBe(0.5 * 100);
  });
});

describe("probabilityWinningAfterMistake", () => {
  it("sums probability of moves that give our eval >= winningCp", () => {
    const result = engineResult([
      { move: "e7e5", eval: 50 },
      { move: "c7c5", eval: -250 },
    ]);
    const dist = [
      { move: "e7e5", probability: 0.7 },
      { move: "c7c5", probability: 0.3 },
    ];
    expect(probabilityWinningAfterMistake(result, dist, 200)).toBe(0.3);
  });

  it("returns 0 when no move crosses winning threshold", () => {
    const result = engineResult([
      { move: "e7e5", eval: 50 },
      { move: "c7c5", eval: -100 },
    ]);
    const dist = [{ move: "c7c5", probability: 1 }];
    expect(probabilityWinningAfterMistake(result, dist, 200)).toBe(0);
  });

  it("treats move not in multipv with default eval drop", () => {
    const result = engineResult([{ move: "e7e5", eval: 50 }]);
    const dist = [{ move: "x7x5", probability: 1 }];
    const evalNotInMultipv = 50 - 100;
    expect(evalNotInMultipv).toBe(-50);
    expect(probabilityWinningAfterMistake(result, dist, 200)).toBe(0);
    expect(probabilityWinningAfterMistake(result, dist, 40)).toBe(1);
  });
});

describe("earlyBonus", () => {
  it("returns 0 when criticalIndex is null", () => {
    expect(earlyBonus(null)).toBe(0);
  });

  it("returns maxBonus at index 0", () => {
    expect(earlyBonus(0)).toBe(50);
  });

  it("decays linearly by decayPerHalfMove", () => {
    expect(earlyBonus(1)).toBe(45);
    expect(earlyBonus(2)).toBe(40);
    expect(earlyBonus(10)).toBe(0);
    expect(earlyBonus(11)).toBe(0);
  });

  it("accepts custom maxBonus and decayPerHalfMove", () => {
    expect(earlyBonus(2, 100, 10)).toBe(80);
    expect(earlyBonus(null, 100, 10)).toBe(0);
  });
});
