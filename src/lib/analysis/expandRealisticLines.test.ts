import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  expandRealisticLines,
  type ExpandRealisticLinesOptions,
} from "./expandRealisticLines";
import { getOpponentMoveDistribution } from "@/lib/opponent/moveProbability";
import { getHumanMoves } from "@/lib/lichess/getHumanMoves";
import { analyzePosition } from "@/lib/engine/analyzePosition";

vi.mock("@/lib/opponent/moveProbability");
vi.mock("@/lib/lichess/getHumanMoves");
vi.mock("@/lib/engine/analyzePosition");

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function toEngine(moves: { move: string; eval: number }[]) {
  return {
    bestMoves: moves.map((m) => ({ ...m, pv: [m.move] })),
  };
}

describe("expandRealisticLines", () => {
  const baseOptions: ExpandRealisticLinesOptions = {
    maxDepth: 4,
    preparerColor: "white",
    opponentProfile: { ratingBucket: "1600-1800", preparerColor: "white" },
    minEntryProbability: 0.05,
    minPracticalWinRate: 0.65,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyzePosition).mockImplementation(async (fen: string) => {
      if (fen.includes("8/8/8/8/8/8/PPPPPPPP/RNBQKBNR"))
        return toEngine([
          { move: "e2e4", eval: 30 },
          { move: "d2d4", eval: 20 },
        ]);
      if (fen.includes("4P3") && fen.includes(" b "))
        return toEngine([
          { move: "e7e5", eval: 0 },
          { move: "c7c5", eval: -10 },
        ]);
      if (fen.includes("4p3") && fen.includes(" w "))
        return toEngine([
          { move: "g1f3", eval: 20 },
          { move: "f1c4", eval: 15 },
        ]);
      if (fen.includes("4pP2") && fen.includes(" b "))
        return toEngine([
          { move: "g8f6", eval: 0 },
          { move: "d7d6", eval: -5 },
        ]);
      return toEngine([{ move: "e2e4", eval: 0 }]);
    });
    vi.mocked(getHumanMoves).mockResolvedValue({
      moves: [
        { move: "e2e4", games: 100, winrate: 0.55 },
        { move: "e7e5", games: 80, winrate: 0.5 },
        { move: "g1f3", games: 90, winrate: 0.55 },
        { move: "g8f6", games: 70, winrate: 0.5 },
      ],
    });
  });

  it("returns at least one line when opponent has one dominant move", async () => {
    vi.mocked(getOpponentMoveDistribution)
      .mockResolvedValueOnce({
        moves: [{ move: "e7e5", probability: 1, source: "lichess" }],
      })
      .mockResolvedValueOnce({
        moves: [{ move: "g8f6", probability: 1, source: "lichess" }],
      })
      .mockResolvedValue({ moves: [] });

    const lines = await expandRealisticLines(START_FEN, "e2e4", baseOptions);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0].lineMoves[0]).toBe("e2e4");
    expect(lines[0].entryProbability).toBe(1);
  });

  it("expands only opponent moves above min probability", async () => {
    vi.mocked(getOpponentMoveDistribution).mockResolvedValueOnce({
      moves: [
        { move: "e7e5", probability: 0.9, source: "lichess" },
        { move: "c7c5", probability: 0.03, source: "lichess" },
      ],
    });

    const lines = await expandRealisticLines(START_FEN, "e2e4", {
      ...baseOptions,
      maxDepth: 2,
    });
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0].lineMoves[0]).toBe("e2e4");
    expect(lines[0].lineMoves[1]).toBe("e7e5");
    expect(lines[0].opponentProbabilityPerStep).toContain(0.9);
  });

  it("treats single move above forced threshold as forced branch", async () => {
    vi.mocked(getOpponentMoveDistribution).mockResolvedValueOnce({
      moves: [
        { move: "e7e5", probability: 0.95, source: "player" },
        { move: "c7c5", probability: 0.05, source: "player" },
      ],
    });

    const lines = await expandRealisticLines(START_FEN, "e2e4", {
      ...baseOptions,
      maxDepth: 2,
    });
    expect(lines.length).toBe(1);
    expect(lines[0].lineMoves[1]).toBe("e7e5");
    expect(lines[0].entryProbability).toBeCloseTo(0.95, 2);
  });
});
