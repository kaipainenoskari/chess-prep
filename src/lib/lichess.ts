import { getDb } from "./db";
import {
  LICHESS_EXPLORER_BASE,
  LICHESS_CLOUD_EVAL_BASE,
  CHESS_API_EVAL_BASE,
  CACHE_OPENING_EXPLORER_TTL,
  EVAL_FALLBACK_DEPTH,
} from "./config";
import type { LichessExplorerResponse } from "./types";

export async function fetchOpeningExplorer(
  fen: string,
  speeds: string = "blitz,rapid",
  ratings: string = "1600,1800",
): Promise<LichessExplorerResponse> {
  const db = getDb();

  const cached = db
    .prepare(
      "SELECT result_json, fetched_at FROM opening_explorer_cache WHERE fen = ? AND speeds = ? AND ratings = ?",
    )
    .get(fen, speeds, ratings) as { result_json: string; fetched_at: number } | undefined;

  const now = Math.floor(Date.now() / 1000);
  if (cached && now - cached.fetched_at < CACHE_OPENING_EXPLORER_TTL) {
    return JSON.parse(cached.result_json);
  }

  const params = new URLSearchParams({
    variant: "standard",
    speeds,
    ratings,
    fen,
  });

  const res = await fetch(`${LICHESS_EXPLORER_BASE}?${params}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Lichess explorer error: ${res.status}`);
  }

  const data = (await res.json()) as LichessExplorerResponse;

  db.prepare(
    `INSERT OR REPLACE INTO opening_explorer_cache (fen, speeds, ratings, result_json, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(fen, speeds, ratings, JSON.stringify(data), now);

  return data;
}

export interface CloudEval {
  fen: string;
  depth: number;
  /** Centipawns — positive favours White. */
  eval: number;
  bestMove?: string;
  continuation?: string[];
}

export async function fetchCloudEval(fen: string): Promise<CloudEval | null> {
  try {
    const params = new URLSearchParams({ fen, multiPv: "1" });
    const res = await fetch(`${LICHESS_CLOUD_EVAL_BASE}?${params}`);
    if (res.ok) {
      const data = await res.json();
      if (data.pvs && data.pvs.length > 0) {
        const pv = data.pvs[0];
        return {
          fen,
          depth: data.depth,
          eval: pv.cp ?? (pv.mate ? (pv.mate > 0 ? 10000 : -10000) : 0),
          bestMove: pv.moves?.split(" ")[0],
          continuation: pv.moves?.split(" ").slice(0, 5),
        };
      }
    }
  } catch {
    // Fallback below
  }

  try {
    const res = await fetch(CHESS_API_EVAL_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen, depth: EVAL_FALLBACK_DEPTH }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        fen,
        depth: data.depth ?? EVAL_FALLBACK_DEPTH,
        eval: data.eval ?? 0,
        bestMove: data.move,
        continuation: data.continuationArr?.slice(0, 5),
      };
    }
  } catch {
    // Both providers failed
  }

  return null;
}
