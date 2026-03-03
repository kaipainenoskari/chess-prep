import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOpponentMoveDistribution, type OpponentProfile } from "./moveProbability";
import { getHumanMoves } from "@/lib/lichess/getHumanMoves";
import { analyzePosition } from "@/lib/engine/analyzePosition";

vi.mock("@/lib/lichess/getHumanMoves");
vi.mock("@/lib/engine/analyzePosition");

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("getOpponentMoveDistribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns lichess distribution when Lichess has data", async () => {
    vi.mocked(getHumanMoves).mockResolvedValue({
      moves: [
        { move: "e2e4", games: 100, winrate: 0.55 },
        { move: "d2d4", games: 50, winrate: 0.5 },
      ],
    });
    const profile: OpponentProfile = {
      ratingBucket: "1600-1800",
      preparerColor: "white",
    };
    const result = await getOpponentMoveDistribution(FEN, profile);
    expect(result.moves.length).toBe(2);
    const e4 = result.moves.find((m) => m.move === "e2e4");
    expect(e4).toBeDefined();
    expect(e4!.probability).toBeCloseTo(100 / 150, 2);
    expect(e4!.source).toBe("lichess");
  });

  it("returns engine fallback when no Lichess data", async () => {
    vi.mocked(getHumanMoves).mockRejectedValue(new Error("no lichess"));
    vi.mocked(analyzePosition).mockResolvedValue({
      bestMoves: [
        { move: "e2e4", eval: 30, pv: ["e2e4"] },
        { move: "d2d4", eval: 20, pv: ["d2d4"] },
      ],
    });
    const profile: OpponentProfile = {
      ratingBucket: "1600-1800",
      preparerColor: "white",
    };
    const result = await getOpponentMoveDistribution(FEN, profile);
    expect(result.moves.length).toBeGreaterThanOrEqual(1);
    expect(result.moves[0].source).toBe("engine");
    expect(analyzePosition).toHaveBeenCalled();
  });
});
