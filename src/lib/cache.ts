import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(REDIS_URL, { lazyConnect: true });
  }
  return globalForRedis.redis;
}

/**
 * Normalize FEN for cache keys (replace spaces with underscores).
 */
export function normalizeFenForKey(fen: string): string {
  return fen.trim().replace(/\s+/g, "_");
}

/**
 * Redis key for engine analysis: engine:{normalizedFen}:{depth}:{multipv}
 */
export function engineCacheKey(fen: string, depth: number, multipv: number): string {
  return `engine:${normalizeFenForKey(fen)}:${depth}:${multipv}`;
}

/**
 * Redis key for Lichess human moves: lichess:{normalizedFen}:{ratingBucket}
 */
export function lichessCacheKey(fen: string, ratingBucket: string): string {
  return `lichess:${normalizeFenForKey(fen)}:${ratingBucket}`;
}

/**
 * Get a JSON-cached value. Returns null on miss or parse error.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const raw = await redis.get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Set a value in Redis with TTL (seconds).
 */
export async function setCached(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const redis = getRedis();
  const serialized = JSON.stringify(value);
  await redis.set(key, serialized, "EX", ttlSeconds);
}

/**
 * Delete all keys matching a prefix (e.g. "engine:" or "lichess:") using the given client.
 */
export async function flushCacheByPrefixWithClient(
  redis: Redis,
  prefix: string,
): Promise<number> {
  let cursor = "0";
  let deleted = 0;
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
    cursor = next;
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== "0");
  return deleted;
}

/**
 * Delete all keys matching a prefix (e.g. "engine:" or "lichess:").
 * Uses SCAN to avoid blocking. Does not touch BullMQ or other keys.
 */
export async function flushCacheByPrefix(prefix: string): Promise<number> {
  return flushCacheByPrefixWithClient(getRedis(), prefix);
}

/**
 * Flush all app caches (engine analysis + Lichess human moves).
 * Leaves BullMQ and other Redis data intact.
 * Pass an optional Redis client (e.g. one with maxRetriesPerRequest: 0 for scripts).
 */
export async function flushAppCache(
  redis?: Redis,
): Promise<{ engine: number; lichess: number }> {
  const client = redis ?? getRedis();
  const [engine, lichess] = await Promise.all([
    flushCacheByPrefixWithClient(client, "engine:"),
    flushCacheByPrefixWithClient(client, "lichess:"),
  ]);
  return { engine, lichess };
}
