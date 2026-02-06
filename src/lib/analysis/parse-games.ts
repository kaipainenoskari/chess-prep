import { Chess } from "chess.js";
import type { ChessComGame, ParsedGame, GameResult } from "../types";

/**
 * Determine game result from perspective of the analyzed player.
 */
function getResult(
  game: ChessComGame,
  playerColor: "white" | "black",
): { result: GameResult; detail: string } {
  const playerData = game[playerColor];
  const r = playerData.result;
  if (r === "win") return { result: "win", detail: "win" };
  if (r === "checkmated" || r === "timeout" || r === "resigned" || r === "abandoned") {
    return { result: "loss", detail: r };
  }
  if (
    r === "stalemate" ||
    r === "agreed" ||
    r === "repetition" ||
    r === "insufficient" ||
    r === "50move" ||
    r === "timevsinsufficient"
  ) {
    return { result: "draw", detail: r };
  }
  // Fallback
  if (r === "win") return { result: "win", detail: r };
  return { result: "loss", detail: r };
}

/**
 * Extract opening name and ECO from PGN headers.
 */
function extractPgnHeader(pgn: string, header: string): string {
  const regex = new RegExp(`\\[${header}\\s+"([^"]*)"\\]`);
  const match = pgn.match(regex);
  return match ? match[1] : "";
}

/**
 * Parse a Chess.com game into our structured format.
 */
export function parseGame(game: ChessComGame, targetUsername: string): ParsedGame | null {
  const lowerTarget = targetUsername.toLowerCase();
  const isWhite = game.white.username.toLowerCase() === lowerTarget;
  const isBlack = game.black.username.toLowerCase() === lowerTarget;

  if (!isWhite && !isBlack) return null;

  const playerColor = isWhite ? "white" : "black";
  const opponentColor = isWhite ? "black" : "white";
  const { result, detail } = getResult(game, playerColor);

  // Parse PGN for moves and clocks
  const moves: string[] = [];
  const clocks: number[] = [];

  try {
    const chess = new Chess();
    const eco = extractPgnHeader(game.pgn, "ECOUrl") || extractPgnHeader(game.pgn, "ECO");
    const openingName =
      extractPgnHeader(game.pgn, "Opening") ||
      (eco ? eco.split("/").pop()?.replace(/-/g, " ") || "" : "");

    // Extract moves from PGN - parse the movetext section
    const moveTextMatch = game.pgn.match(
      /\n\n([\s\S]*?)(?:\s*(?:1-0|0-1|1\/2-1\/2|\*)?\s*$)/,
    );
    const moveText = moveTextMatch ? moveTextMatch[1] : "";

    // Extract clock annotations
    const clockRegex = /\{[^}]*\[%clk\s+(\d+:\d+:\d+(?:\.\d+)?)\][^}]*\}/g;
    let clockMatch;
    while ((clockMatch = clockRegex.exec(moveText)) !== null) {
      const timeStr = clockMatch[1];
      const parts = timeStr.split(":");
      const seconds =
        parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
      clocks.push(seconds);
    }

    // Parse moves using chess.js by loading PGN
    // First strip comments for clean move extraction
    const cleanMoveText = moveText
      .replace(/\{[^}]*\}/g, "") // remove comments
      .replace(/\d+\.\.\./g, "") // remove continuation dots
      .replace(/\d+\./g, "") // remove move numbers
      .replace(/\s+/g, " ") // normalize whitespace
      .replace(/1-0|0-1|1\/2-1\/2|\*/g, "") // remove results
      .trim();

    if (cleanMoveText) {
      const moveTokens = cleanMoveText.split(/\s+/).filter((t) => t.length > 0);
      for (const token of moveTokens) {
        try {
          chess.move(token);
          moves.push(token);
        } catch {
          // Skip invalid moves
          break;
        }
      }
    }

    return {
      url: game.url,
      uuid: game.uuid,
      playerColor,
      opponentUsername: game[opponentColor].username,
      playerRating: game[playerColor].rating,
      opponentRating: game[opponentColor].rating,
      result,
      resultDetail: detail,
      timeClass:
        game.time_class === "daily" || game.time_class === "correspondence"
          ? "rapid" // bucket daily into rapid for simplicity
          : game.time_class,
      timeControl: game.time_control,
      eco: extractPgnHeader(game.pgn, "ECO"),
      openingName: openingName || "Unknown",
      moves,
      clocks,
      numMoves: Math.ceil(moves.length / 2),
      endTime: game.end_time,
      accuracy: game.accuracies ? game.accuracies[playerColor] : undefined,
      fen: game.fen,
    };
  } catch {
    return null;
  }
}

/**
 * Parse all games for a target player.
 */
export function parseAllGames(
  games: ChessComGame[],
  targetUsername: string,
): ParsedGame[] {
  const parsed: ParsedGame[] = [];
  for (const game of games) {
    const p = parseGame(game, targetUsername);
    if (p) parsed.push(p);
  }
  // Sort by end time ascending
  parsed.sort((a, b) => a.endTime - b.endTime);
  return parsed;
}
