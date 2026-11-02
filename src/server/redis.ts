import Redis from "ioredis";

const g = globalThis as unknown as { redis?: Redis | null };

/** Redis для rate limiting и realtime. Без REDIS_URL возвращает null — вызывающий код работает в памяти. */
export function getRedis(): Redis | null {
  if (g.redis !== undefined) return g.redis;
  const url = process.env.REDIS_URL;
  g.redis = url ? new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false, enableOfflineQueue: true }) : null;
  g.redis?.on("error", (e) => console.error("[redis]", e.message));
  return g.redis;
}
