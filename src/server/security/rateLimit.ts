import { getRedis } from "../redis";

const mem = new Map<string, { n: number; reset: number }>();

/** Скользящее окно фиксированной длины. Возвращает true, если запрос разрешён. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number }> {
  const redis = getRedis();
  if (redis && redis.status === "ready") {
    const k = `rl:${key}`;
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, windowSec);
    const ttl = n > limit ? await redis.ttl(k) : 0;
    return { ok: n <= limit, retryAfter: Math.max(ttl, 0) };
  }
  const now = Date.now(); const e = mem.get(key);
  if (!e || e.reset < now) { mem.set(key, { n: 1, reset: now + windowSec * 1000 }); return { ok: true, retryAfter: 0 }; }
  e.n++;
  return { ok: e.n <= limit, retryAfter: Math.ceil((e.reset - now) / 1000) };
}
