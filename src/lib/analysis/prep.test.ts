import { describe, it, expect, vi } from "vitest";
import type { LichessExplorerMove, OpponentMoveInfo } from "../types";
import {
  ratingToBrackets,
  scorePrepCandidates,
  applyEngineScores,
  candidateToSuggestion,
  buildPrepLine,
  type ExplorerFetcher,
} from "./prep";

// ---------------------------------------------------------------------------
// ratingToBrackets
// ---------------------------------------------------------------------------

describe("ratingToBrackets", () => {
  it("maps a 1500 Chess.com rating to 1600,1800 (Lichess ~1600)", () => {
    expect(ratingToBrackets(1500)).toBe("1600,1800");
  });

  it("maps a 1000 Chess.com rating to 1000,1200", () => {
    expect(ratingToBrackets(1000)).toBe("1000,1200");
  });

  it("maps a very high rating to the top two buckets", () => {
    expect(ratingToBrackets(2500)).toBe("2200,2500");
  });

  it("maps a low rating (800) to 0,1000", () => {
    expect(ratingToBrackets(800)).toBe("0,1000");
  });

  it("maps 1700 to 1800,2000", () => {
    expect(ratingToBrackets(1700)).toBe("1800,2000");
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePopMove(
  san: string,
  white: number,
  draws: number,
  black: number,
): LichessExplorerMove {
  return { san, uci: "", white, draws, black, averageRating: 1600 };
}

function makeOppMove(move: string, games: number, winRate: number): OpponentMoveInfo {
  return { move, games, winRate };
}

// ---------------------------------------------------------------------------
// scorePrepCandidates
// ---------------------------------------------------------------------------

describe("scorePrepCandidates", () => {
  it("returns an empty list when all moves have too few games", () => {
    const popMoves = [makePopMove("e4", 2, 1, 1)]; // 4 total < 5
    const result = scorePrepCandidates(popMoves, [], "white");
    expect(result).toHaveLength(0);
  });

  it("scores a surprise move highly (opponent has 0 games)", () => {
    const popMoves = [
      makePopMove("e4", 30, 10, 10), // 50 total, 70% wr for white
      makePopMove("d4", 25, 15, 10), // 50 total, 60% wr for white
    ];
    const oppMoves = [makeOppMove("d4", 15, 0.5)]; // opponent knows d4

    const result = scorePrepCandidates(popMoves, oppMoves, "white");
    expect(result.length).toBe(2);

    // e4 should score higher than d4 because it's a surprise
    const e4 = result.find((c) => c.move === "e4")!;
    const d4 = result.find((c) => c.move === "d4")!;
    expect(e4.baseScore).toBeGreaterThan(d4.baseScore);
    expect(e4.tags).toContain("surprise");
  });

  it("scores an opponent weakness highly", () => {
    const popMoves = [
      makePopMove("e4", 20, 10, 20), // 50% wr for white
      makePopMove("d4", 20, 10, 20), // 50% wr for white
    ];
    const oppMoves = [
      makeOppMove("e4", 10, 0.2), // opponent does terribly against e4
      makeOppMove("d4", 10, 0.5), // opponent does fine against d4
    ];

    const result = scorePrepCandidates(popMoves, oppMoves, "white");
    const e4 = result.find((c) => c.move === "e4")!;
    const d4 = result.find((c) => c.move === "d4")!;
    expect(e4.baseScore).toBeGreaterThan(d4.baseScore);
    expect(e4.tags).toContain("weakness");
  });

  it("includes reasoning text", () => {
    const popMoves = [makePopMove("e4", 30, 10, 10)];
    const result = scorePrepCandidates(popMoves, [], "white");
    expect(result[0].reasoning).toContain("never faced this");
    expect(result[0].reasoning).toContain("win rate");
  });

  it("handles scoring from black's perspective", () => {
    const popMoves = [makePopMove("e4", 10, 10, 30)]; // 60% wr for black
    const result = scorePrepCandidates(popMoves, [], "black");
    expect(result[0].populationWinRate).toBeGreaterThan(0.55);
  });

  it("sorts candidates by score descending", () => {
    const popMoves = [
      makePopMove("a3", 10, 10, 30), // bad for white
      makePopMove("e4", 40, 5, 5), // great for white
      makePopMove("d4", 30, 10, 10), // good for white
    ];
    const result = scorePrepCandidates(popMoves, [], "white");
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].baseScore).toBeGreaterThanOrEqual(result[i].baseScore);
    }
  });
});

// ---------------------------------------------------------------------------
// applyEngineScores
// ---------------------------------------------------------------------------

describe("applyEngineScores", () => {
  it("filters out moves with eval below -200cp", () => {
    const popMoves = [makePopMove("e4", 20, 10, 20), makePopMove("g4", 20, 10, 20)];
    const candidates = scorePrepCandidates(popMoves, [], "white");

    const evals = new Map<string, number>();
    evals.set("e4", 50);
    evals.set("g4", -250); // should be filtered

    const refined = applyEngineScores(candidates, evals);
    expect(refined.find((c) => c.move === "g4")).toBeUndefined();
    expect(refined.find((c) => c.move === "e4")).toBeDefined();
  });

  it("adds 'sound' tag for good eval", () => {
    const popMoves = [makePopMove("e4", 20, 10, 20)];
    const candidates = scorePrepCandidates(popMoves, [], "white");
    const evals = new Map([["e4", 100]]);
    const refined = applyEngineScores(candidates, evals);
    expect(refined[0].tags).toContain("sound");
  });

  it("adds 'speculative' tag for slightly bad eval", () => {
    const popMoves = [makePopMove("b4", 20, 10, 20)];
    const candidates = scorePrepCandidates(popMoves, [], "white");
    const evals = new Map([["b4", -80]]);
    const refined = applyEngineScores(candidates, evals);
    expect(refined[0].tags).toContain("speculative");
  });

  it("does not crash when eval is missing for a candidate", () => {
    const popMoves = [makePopMove("e4", 20, 10, 20)];
    const candidates = scorePrepCandidates(popMoves, [], "white");
    const evals = new Map<string, number>(); // empty
    const refined = applyEngineScores(candidates, evals);
    expect(refined).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// candidateToSuggestion
// ---------------------------------------------------------------------------

describe("candidateToSuggestion", () => {
  it("converts a scored candidate to a PrepSuggestion", () => {
    const popMoves = [makePopMove("e4", 30, 10, 10)];
    const candidates = scorePrepCandidates(popMoves, [], "white");
    const suggestion = candidateToSuggestion(candidates[0], 42);
    expect(suggestion.move).toBe("e4");
    expect(suggestion.engineEval).toBe(42);
    expect(suggestion.score).toBeGreaterThan(0);
    expect(suggestion.score).toBeLessThanOrEqual(100);
    expect(suggestion.line).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildPrepLine
// ---------------------------------------------------------------------------

describe("buildPrepLine", () => {
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("builds a line of the requested depth", async () => {
    // Return legal moves for each successive call
    const responses = [
      [makePopMove("e5", 20, 10, 10)], // after e4: black plays e5
      [makePopMove("Nf3", 30, 10, 10)], // after e4 e5: white plays Nf3
      [makePopMove("Nc6", 15, 5, 20)], // after e4 e5 Nf3: black plays Nc6
    ];
    let callIdx = 0;
    const mockFetcher: ExplorerFetcher = vi.fn(async () => ({
      moves: responses[callIdx++] ?? [],
    }));

    const line = await buildPrepLine(
      START_FEN,
      "e4",
      "white",
      "1600,1800",
      "blitz,rapid",
      4,
      mockFetcher,
    );

    expect(line.length).toBe(4);
    expect(line[0].move).toBe("e4");
    expect(line[0].isPlayerMove).toBe(true);
  });

  it("stops when explorer returns no moves", async () => {
    let callCount = 0;
    const mockFetcher: ExplorerFetcher = vi.fn(async () => {
      callCount++;
      if (callCount > 1) return { moves: [] };
      return { moves: [makePopMove("e5", 20, 10, 10)] };
    });

    const line = await buildPrepLine(
      START_FEN,
      "e4",
      "white",
      "1600,1800",
      "blitz,rapid",
      6,
      mockFetcher,
    );

    // e4 + e5 + stops
    expect(line.length).toBe(2);
  });

  it("correctly sets isPlayerMove for both sides", async () => {
    const responses = [[makePopMove("e5", 20, 10, 10)], [makePopMove("Nf3", 30, 10, 10)]];
    let callIdx = 0;
    const mockFetcher: ExplorerFetcher = vi.fn(async () => ({
      moves: responses[callIdx++] ?? [],
    }));

    const line = await buildPrepLine(
      START_FEN,
      "e4",
      "white",
      "1600,1800",
      "blitz,rapid",
      3,
      mockFetcher,
    );

    expect(line.length).toBe(3);
    expect(line[0].isPlayerMove).toBe(true); // e4 (white = preparer)
    expect(line[1].isPlayerMove).toBe(false); // e5 (black = opponent)
    expect(line[2].isPlayerMove).toBe(true); // Nf3 (white = preparer)
  });

  it("handles invalid initial move gracefully", async () => {
    const mockFetcher: ExplorerFetcher = vi.fn(async () => ({
      moves: [],
    }));

    const line = await buildPrepLine(
      START_FEN,
      "Qxh7",
      "white",
      "1600,1800",
      "blitz,rapid",
      4,
      mockFetcher,
    );

    expect(line.length).toBe(0);
  });

  it("works for black preparer", async () => {
    // After 1.e4, black to move
    const fenAfterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

    const responses = [
      [makePopMove("Nf3", 20, 10, 10)], // after e4 c5: white plays Nf3
      [makePopMove("d6", 15, 10, 15)], // after e4 c5 Nf3: black plays d6
    ];
    let callIdx = 0;
    const mockFetcher: ExplorerFetcher = vi.fn(async () => ({
      moves: responses[callIdx++] ?? [],
    }));

    const line = await buildPrepLine(
      fenAfterE4,
      "c5",
      "black",
      "1600,1800",
      "blitz,rapid",
      3,
      mockFetcher,
    );

    expect(line[0].move).toBe("c5");
    expect(line[0].isPlayerMove).toBe(true); // black is preparer
    expect(line.length).toBe(3);
    expect(line[1].isPlayerMove).toBe(false); // white = opponent
    expect(line[2].isPlayerMove).toBe(true); // black = preparer
  });
});
