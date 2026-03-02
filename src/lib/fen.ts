import { Chess } from "chess.js";

const CASTLING_ALIASES: Record<string, string> = {
  e1h1: "e1g1",
  e1a1: "e1c1",
  e8h8: "e8g8",
  e8a8: "e8c8",
};

function normalizeUci(uci: string): string {
  const key = uci.slice(0, 4).toLowerCase();
  return CASTLING_ALIASES[key] ?? uci;
}

/**
 * Normalize FEN for consistent lookup: trim and ensure 6 fields when missing.
 * Preserves castling and all other fields from the source (e.g. chess.js game.fen()).
 */
export function normalizeFenForLookup(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length >= 6) return fen.trim();
  if (parts.length < 4) return fen.trim();
  const out = [...parts];
  while (out.length < 6) {
    out.push(out.length === 4 ? "0" : "1");
  }
  return out.join(" ");
}

/**
 * Apply a UCI move to a FEN and return the resulting FEN (normalized for lookup).
 * Returns null if the move is illegal.
 */
export function applyMoveUci(fen: string, uci: string): string | null {
  const game = new Chess(fen);
  const n = normalizeUci(uci);
  const from = n.slice(0, 2);
  const to = n.slice(2, 4);
  const promotion = n.length > 4 ? (n[4] as "q" | "r" | "b" | "n") : undefined;
  const applied = game.move({ from, to, promotion });
  if (!applied) return null;
  return normalizeFenForLookup(game.fen());
}
