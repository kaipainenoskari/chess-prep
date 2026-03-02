/**
 * Flush Redis app caches (engine analysis + Lichess human moves).
 * Does not touch BullMQ job data.
 * Usage: npx tsx scripts/flush-redis-cache.ts
 * Requires: REDIS_URL in env (or .env). Redis must be running.
 */
import "dotenv/config";
import Redis from "ioredis";
import { flushAppCache } from "../src/lib/cache";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

async function main() {
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  redis.on("error", (err: Error) => {
    console.error("[flush-redis-cache] Redis connection error:", err.message);
  });

  const result = await flushAppCache(redis);
  console.log("[flush-redis-cache] Flushed:", result);
  redis.disconnect();
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  const isConnectionError =
    msg.includes("ECONNREFUSED") ||
    msg.includes("Connection is closed") ||
    msg.includes("max retries") ||
    msg.includes("MaxRetriesPerRequest");
  if (isConnectionError) {
    console.error("[flush-redis-cache] Cannot connect to Redis. Is Redis running?");
    console.error("  REDIS_URL:", REDIS_URL);
    console.error("  Start Redis e.g.: docker run -p 6379:6379 redis");
  } else {
    console.error(err);
  }
  process.exit(1);
});
