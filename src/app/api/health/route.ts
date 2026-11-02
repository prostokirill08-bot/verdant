import { route, json } from "@/server/http";
import { db } from "@/server/db";
import { getRedis } from "@/server/redis";

// Проверка для балансировщика/хостинга: БД, Redis, цикл Crash
export const GET = route({ rate: { key: "health", limit: 120, window: 60 } }, async () => {
  const t0 = Date.now();
  const dbOk = await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  const redis = getRedis();
  const redisOk = redis ? await redis.ping().then((r) => r === "PONG").catch(() => false) : null;
  const last = dbOk ? await db.crashRound.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null;
  const crashOk = !!last && Date.now() - last.createdAt.getTime() < 5 * 60_000;
  const ok = dbOk && redisOk !== false;
  return json({ ok, db: dbOk, redis: redisOk === null ? "not_configured" : redisOk, crashLoop: crashOk, ms: Date.now() - t0 }, ok ? 200 : 503);
});
