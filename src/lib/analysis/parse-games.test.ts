import { describe, it, expect } from "vitest";
import { parseGame, parseAllGames } from "./parse-games";
import type { ChessComGame } from "../types";

/**
 * Build a minimal but realistic ChessComGame fixture.
 */
function makeRawGame(overrides: Partial<ChessComGame> = {}): ChessComGame {
  const defaultPgn = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2025.01.15"]
[Round "-"]
[White "player1"]
[Black "player2"]
[Result "1-0"]
[ECO "C20"]
[Opening "King's Pawn Opening"]
[TimeControl "180+0"]

1. e4 {[%clk 0:02:58]} 1... e5 {[%clk 0:02:56]} 2. Nf3 {[%clk 0:02:50]} 2... Nc6 {[%clk 0:02:48]} 1-0`;

  return {
    url: "https://www.chess.com/game/live/12345",
    uuid: "test-uuid-1",
    pgn: defaultPgn,
    time_control: "180+0",
    time_class: "blitz",
    rules: "chess",
    rated: true,
    end_time: 1705330000,
    fen: "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    white: {
      username: "player1",
      rating: 1500,
      result: "win",
    },
    black: {
      username: "player2",
      rating: 1480,
      result: "checkmated",
    },
    ...overrides,
  };
}

describe("parseGame", () => {
  it("returns null when target user is not in the game", () => {
    const game = makeRawGame();
    expect(parseGame(game, "nobody")).toBeNull();
  });

  it("correctly identifies player colour", () => {
    const game = makeRawGame();
    const parsed = parseGame(game, "player1");
    expect(parsed).not.toBeNull();
    expect(parsed!.playerColor).toBe("white");

    const asBlack = parseGame(game, "player2");
    expect(asBlack).not.toBeNull();
    expect(asBlack!.playerColor).toBe("black");
  });

  it("determines result from player perspective", () => {
    const game = makeRawGame();
    expect(parseGame(game, "player1")!.result).toBe("win");
    expect(parseGame(game, "player2")!.result).toBe("loss");
  });

  it("extracts moves from PGN", () => {
    const parsed = parseGame(makeRawGame(), "player1");
    expect(parsed!.moves.length).toBeGreaterThanOrEqual(2);
    expect(parsed!.moves[0]).toBe("e4");
  });

  it("extracts clock annotations", () => {
    const parsed = parseGame(makeRawGame(), "player1");
    expect(parsed!.clocks.length).toBeGreaterThan(0);
    // First white clock: 0:02:58 = 178 seconds
    expect(parsed!.clocks[0]).toBe(178);
  });

  it("detects draws", () => {
    const game = makeRawGame({
      white: { username: "player1", rating: 1500, result: "stalemate", uuid: "w" },
      black: { username: "player2", rating: 1480, result: "stalemate", uuid: "b" },
    });
    const parsed = parseGame(game, "player1");
    expect(parsed!.result).toBe("draw");
  });

  it("is case-insensitive for username matching", () => {
    const game = makeRawGame();
    expect(parseGame(game, "PLAYER1")).not.toBeNull();
    expect(parseGame(game, "Player1")).not.toBeNull();
  });
});

describe("parseAllGames", () => {
  it("parses multiple games and sorts by endTime", () => {
    const games = [
      makeRawGame({ end_time: 3000, uuid: "a" }),
      makeRawGame({ end_time: 1000, uuid: "b" }),
      makeRawGame({ end_time: 2000, uuid: "c" }),
    ];

    const parsed = parseAllGames(games, "player1");
    expect(parsed.length).toBe(3);
    expect(parsed[0].endTime).toBe(1000);
    expect(parsed[2].endTime).toBe(3000);
  });

  it("skips games where target is not a participant", () => {
    const games = [
      makeRawGame(),
      makeRawGame({
        white: { username: "other1", rating: 1400, result: "win", uuid: "o1" },
        black: { username: "other2", rating: 1400, result: "checkmated", uuid: "o2" },
      }),
    ];

    const parsed = parseAllGames(games, "player1");
    expect(parsed.length).toBe(1);
  });
});
