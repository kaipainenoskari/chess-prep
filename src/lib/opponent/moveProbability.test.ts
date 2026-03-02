import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOpponentMoveDistribution, type OpponentProfile } from "./moveProbability";
import { getOpponentMovesAtFen } from "@/lib/prep/getOpponentMovesAtFen";
import { getHumanMoves } from "@/lib/lichess/getHumanMoves";
import { analyzePosition } from "@/lib/engine/analyzePosition";

vi.mock("@/lib/prep/getOpponentMovesAtFen");
vi.mock("@/lib/lichess/getHumanMoves");
vi.mock("@/lib/engine/analyzePosition");

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("getOpponentMoveDistribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns player distribution when only player data exists", async () => {
    vi.mocked(getOpponentMovesAtFen).mockResolvedValue([
      { move: "e4", games: 80 },
      { move: "d4", games: 20 },
    ]);
    vi.mocked(getHumanMoves).mockRejectedValue(new Error("no lichess"));
    const profile: OpponentProfile = {
      projectId: "proj1",
      ratingBucket: "1600-1800",
      preparerColor: "white",
    };
    const result = await getOpponentMoveDistribution(FEN, profile);
    expect(result.moves.length).toBeGreaterThanOrEqual(1);
    const e4 = result.moves.find(
      (m) => m.move === "e2e4" || m.move.toLowerCase() === "e2e4",
    );
    expect(e4).toBeDefined();
    expect(e4!.probability).toBeCloseTo(0.8, 2);
    expect(e4!.source).toBe("player");
  });

  it("returns lichess distribution when no projectId", async () => {
    vi.mocked(getOpponentMovesAtFen).mockResolvedValue([]);
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

  it("returns engine fallback when no human data", async () => {
    vi.mocked(getOpponentMovesAtFen).mockResolvedValue([]);
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
