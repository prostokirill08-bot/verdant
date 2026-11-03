import { getRedis } from "./redis";

// Онлайн: кто за последнюю минуту открывал сайт (вошедшие — по аккаунту, гости — по случайному id вкладки-браузера)
const KEY = "verdant:online";
const WINDOW_MS = 60_000;
const g = globalThis as unknown as { presence?: Map<string, number> };
const mem = () => (g.presence ??= new Map());

export async function touchOnline(id: string): Promise<number> {
  const now = Date.now();
  const r = getRedis();
  if (r) {
    try {
      const res = await r.multi().zadd(KEY, now, id).zremrangebyscore(KEY, 0, now - WINDOW_MS).zcard(KEY).pexpire(KEY, WINDOW_MS * 5).exec();
      return Number(res?.[2]?.[1] ?? 1);
    } catch { /* Redis недоступен — считаем в памяти */ }
  }
  const m = mem(); m.set(id, now);
  for (const [k, t] of m) if (t < now - WINDOW_MS) m.delete(k);
  return m.size;
}

export async function countOnline(): Promise<number> {
  const now = Date.now();
  const r = getRedis();
  if (r) {
    try { await r.zremrangebyscore(KEY, 0, now - WINDOW_MS); return await r.zcard(KEY); } catch { /* в памяти */ }
  }
  let n = 0; for (const t of mem().values()) if (t >= now - WINDOW_MS) n++;
  return n;
}
