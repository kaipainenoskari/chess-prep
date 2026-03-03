import { prisma } from "@/lib/prisma";
import { getCached, setCached, lichessCacheKey } from "@/lib/cache";
import {
  LICHESS_EXPLORER_BASE,
  CACHE_LICHESS_TTL,
  FEN_MOVE_SERVICE_URL,
} from "@/lib/config";
import type { LichessExplorerResponse } from "@/lib/types";
import { normalizeFenForLookup } from "@/lib/fen";

const DEFAULT_SPEEDS = "blitz,rapid";

const LOG_LICHESS =
  process.env.LOG_LICHESS === "1" || process.env.DEBUG?.includes("lichess");

function logLichess(msg: string, data?: object) {
  if (LOG_LICHESS) {
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    console.error(`[Lichess] ${msg}${payload}`);
  }
}

/**
 * Map rating bucket "1600-1800" to Lichess API ratings param "1600,1800".
 */
function ratingBucketToRatings(bucket: string): string {
  return bucket.replace("-", ",");
}

function sideToMoveFromFen(fen: string): "w" | "b" {
  const parts = fen.trim().split(/\s+/);
  const color = parts[1]?.toLowerCase();
  return color === "b" ? "b" : "w";
}

export interface HumanMoveStat {
  move: string;
  games: number;
  winrate: number;
}

export interface GetHumanMovesResult {
  moves: HumanMoveStat[];
}

/**
 * Fetch human move frequencies for a position: Redis → LichessMoveCache → local FEN service or Lichess API.
 * When FEN_MOVE_SERVICE_URL is set, uses GET {base}/query?fen=...&bucket=... (same response shape as GetHumanMovesResult).
 * Otherwise falls back to the Lichess Explorer API. Winrate is from the perspective of the side to move.
 */
export async function getHumanMoves(
  fen: string,
  ratingBucket: string,
): Promise<GetHumanMovesResult> {
  const key = lichessCacheKey(fen, ratingBucket);

  const fromRedis = await getCached<GetHumanMovesResult>(key);
  if (fromRedis) {
    const total = fromRedis.moves.reduce((s, m) => s + m.games, 0);
    if (total > 0) {
      logLichess("getHumanMoves hit", {
        source: "redis",
        fenSnippet: fen.slice(0, 50),
        ratingBucket,
        movesLength: fromRedis.moves.length,
        totalGames: total,
      });
      return fromRedis;
    }
    logLichess("getHumanMoves skip empty cache", {
      source: "redis",
      fenSnippet: fen.slice(0, 50),
      ratingBucket,
    });
  }

  const fromDb = await prisma.lichessMoveCache.findUnique({
    where: { fen_ratingBucket: { fen, ratingBucket } },
  });
  if (fromDb?.movesJson) {
    const result = fromDb.movesJson as unknown as GetHumanMovesResult;
    const total = result.moves.reduce((s, m) => s + m.games, 0);
    if (total > 0) {
      logLichess("getHumanMoves hit", {
        source: "db",
        fenSnippet: fen.slice(0, 50),
        ratingBucket,
        movesLength: result.moves.length,
        totalGames: total,
      });
      await setCached(key, result, CACHE_LICHESS_TTL);
      return result;
    }
    logLichess("getHumanMoves skip empty cache", {
      source: "db",
      fenSnippet: fen.slice(0, 50),
      ratingBucket,
    });
  }

  const fenForApi = normalizeFenForLookup(fen);

  if (FEN_MOVE_SERVICE_URL) {
    return fetchFromLocalService(FEN_MOVE_SERVICE_URL, fen, fenForApi, ratingBucket, key);
  }

  const ratings = ratingBucketToRatings(ratingBucket);
  const params = new URLSearchParams({
    variant: "standard",
    speeds: DEFAULT_SPEEDS,
    ratings,
    fen: fenForApi,
  });
  const url = `${LICHESS_EXPLORER_BASE}?${params}`;
  logLichess("getHumanMoves fetch", {
    fenSnippet: fen.slice(0, 50),
    ratingBucket,
    urlLength: url.length,
  });

  async function fetchOnce(): Promise<Response> {
    return fetch(url, { headers: { Accept: "application/json" } });
  }

  let res: Response;
  try {
    res = await fetchOnce();
  } catch (err) {
    logLichess("getHumanMoves fetch failed", {
      error: err instanceof Error ? err.message : String(err),
      fenSnippet: fen.slice(0, 50),
      ratingBucket,
    });
    throw err;
  }

  if (res.status === 429) {
    logLichess("getHumanMoves rate limited (429), waiting 60s", {
      fenSnippet: fen.slice(0, 50),
      ratingBucket,
    });
    await new Promise((r) => setTimeout(r, 60_000));
    res = await fetchOnce();
  }

  if (!res.ok) {
    logLichess("getHumanMoves API error", {
      status: res.status,
      fenSnippet: fen.slice(0, 50),
      ratingBucket,
    });
    throw new Error(`Lichess explorer error: ${res.status}`);
  }
  const data = (await res.json()) as LichessExplorerResponse;

  if (!data.moves || data.moves.length === 0) {
    logLichess("getHumanMoves API returned no moves", {
      fenSnippet: fen.slice(0, 50),
      ratingBucket,
      ratings,
      responseKeys: Object.keys(data),
      totalWhite: (data as { white?: number }).white,
      totalDraws: (data as { draws?: number }).draws,
      totalBlack: (data as { black?: number }).black,
      rawSnippet: JSON.stringify(data).slice(0, 500),
    });
  }

  const side = sideToMoveFromFen(fen);
  const moves: HumanMoveStat[] = (data.moves ?? []).map((m) => {
    const games = m.white + m.draws + m.black;
    const wins = side === "w" ? m.white : m.black;
    const winrate = games > 0 ? (wins + m.draws / 2) / games : 0;
    return {
      move: m.uci ?? m.san,
      games,
      winrate,
    };
  });

  const result: GetHumanMovesResult = { moves };
  const totalGames = moves.reduce((s, m) => s + m.games, 0);
  logLichess("getHumanMoves fetched", {
    source: "api",
    fenSnippet: fen.slice(0, 50),
    ratingBucket,
    movesLength: moves.length,
    totalGames,
    topMoves: moves.slice(0, 5).map((m) => ({ move: m.move, games: m.games })),
  });

  if (totalGames > 0) {
    await prisma.lichessMoveCache.upsert({
      where: { fen_ratingBucket: { fen, ratingBucket } },
      create: { fen, ratingBucket, movesJson: result as object },
      update: { movesJson: result as object },
    });
    await setCached(key, result, CACHE_LICHESS_TTL);
  } else {
    logLichess("getHumanMoves not caching empty", {
      fenSnippet: fen.slice(0, 50),
      ratingBucket,
    });
  }

  return result;
}

/**
 * Fetch human move stats from the local FEN→move-frequency service.
 * Response shape must match GetHumanMovesResult (moves: { move, games, winrate }[]).
 */
async function fetchFromLocalService(
  baseUrl: string,
  fen: string,
  fenNorm: string,
  ratingBucket: string,
  cacheKey: string,
): Promise<GetHumanMovesResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/query?fen=${encodeURIComponent(fenNorm)}&bucket=${encodeURIComponent(ratingBucket)}`;
  logLichess("getHumanMoves fetch (local)", {
    fenSnippet: fen.slice(0, 50),
    ratingBucket,
  });

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`FEN move service error: ${res.status}`);
  }
  const data = (await res.json()) as { moves?: HumanMoveStat[] };
  const moves: HumanMoveStat[] = (data.moves ?? []).map((m) => ({
    move: m.move,
    games: Number(m.games) || 0,
    winrate: Number(m.winrate) ?? 0,
  }));
  const result: GetHumanMovesResult = { moves };
  const totalGames = moves.reduce((s, m) => s + m.games, 0);

  logLichess("getHumanMoves fetched", {
    source: "local",
    fenSnippet: fen.slice(0, 50),
    ratingBucket,
    movesLength: moves.length,
    totalGames,
    topMoves: moves.slice(0, 5).map((m) => ({ move: m.move, games: m.games })),
  });

  if (totalGames > 0) {
    await prisma.lichessMoveCache.upsert({
      where: { fen_ratingBucket: { fen, ratingBucket } },
      create: { fen, ratingBucket, movesJson: result as object },
      update: { movesJson: result as object },
    });
    await setCached(cacheKey, result, CACHE_LICHESS_TTL);
  }
  return result;
}
