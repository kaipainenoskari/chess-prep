import { prisma } from "@/lib/prisma";
import { getCached, setCached, engineCacheKey } from "@/lib/cache";
import {
  LICHESS_CLOUD_EVAL_BASE,
  CHESS_API_EVAL_BASE,
  EVAL_FALLBACK_DEPTH,
  CACHE_ENGINE_TTL,
} from "@/lib/config";
import type { EngineAnalysisResult } from "./types";

function cpFromPv(pv: { cp?: number; mate?: number }): number {
  if (pv.cp != null) return pv.cp;
  if (pv.mate != null) return pv.mate > 0 ? 10000 : -10000;
  return 0;
}

async function fetchFromLichess(
  fen: string,
  multipv: number,
): Promise<EngineAnalysisResult | null> {
  const params = new URLSearchParams({ fen, multiPv: String(multipv) });
  const res = await fetch(`${LICHESS_CLOUD_EVAL_BASE}?${params}`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    depth?: number;
    pvs?: Array<{ cp?: number; mate?: number; moves?: string }>;
  };
  if (!data.pvs?.length) return null;
  const bestMoves = data.pvs.slice(0, multipv).map((pv) => {
    const moves = pv.moves?.trim().split(/\s+/) ?? [];
    return {
      move: moves[0] ?? "",
      eval: cpFromPv(pv),
      pv: moves,
    };
  });
  return { bestMoves };
}

async function fetchFromChessApi(fen: string): Promise<EngineAnalysisResult | null> {
  const res = await fetch(CHESS_API_EVAL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fen, depth: EVAL_FALLBACK_DEPTH }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    depth?: number;
    eval?: number;
    move?: string;
    continuationArr?: string[];
  };
  const move = data.move ?? "";
  const pv = data.continuationArr ?? (move ? [move] : []);
  return {
    bestMoves: [
      {
        move,
        eval: data.eval ?? 0,
        pv,
      },
    ],
  };
}

/**
 * Analyze a position: Redis → PositionCache (Postgres) → Lichess/chess-api.
 * Returns multi-PV engine result. Caches in Redis and Postgres.
 */
export async function analyzePosition(
  fen: string,
  depth: number,
  multipv: number,
): Promise<EngineAnalysisResult> {
  const key = engineCacheKey(fen, depth, multipv);

  const fromRedis = await getCached<EngineAnalysisResult>(key);
  if (fromRedis?.bestMoves?.length) return fromRedis;

  const fromDb = await prisma.positionCache.findUnique({
    where: { fen_depth_multipv: { fen, depth, multipv } },
  });
  if (fromDb?.engineJson) {
    const result = fromDb.engineJson as unknown as EngineAnalysisResult;
    await setCached(key, result, CACHE_ENGINE_TTL);
    return result;
  }

  const fromApi =
    (await fetchFromLichess(fen, multipv)) ?? (await fetchFromChessApi(fen));

  if (!fromApi?.bestMoves?.length) {
    return { bestMoves: [] };
  }

  await prisma.positionCache.upsert({
    where: { fen_depth_multipv: { fen, depth, multipv } },
    create: {
      fen,
      depth,
      multipv,
      engineJson: fromApi as object,
    },
    update: { engineJson: fromApi as object },
  });
  await setCached(key, fromApi, CACHE_ENGINE_TTL);

  return fromApi;
}
