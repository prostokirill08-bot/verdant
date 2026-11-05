import { touchOnline } from "./presence";

/**
 * Демо-посетители для счётчика «онлайн» и само-пинг против засыпания на бесплатном Render.
 *
 * Боты только отмечаются в счётчике онлайн: они не делают ставок, не попадают
 * в рейтинги, турниры, ленту выигрышей и статистику раундов.
 *
 * ONLINE_BOTS: "5-10" (по умолчанию) — сколько демо-посетителей держать; "0" — выключить.
 * KEEPALIVE_URL: адрес сайта для само-пинга. На Render берётся RENDER_EXTERNAL_URL автоматически.
 */
function parseRange(v: string | undefined): [number, number] {
  const m = (v ?? "5-10").trim().match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!m) return [5, 10];
  const lo = Math.min(Number(m[1]), 50), hi = Math.min(Number(m[2] ?? m[1]), 50);
  return lo <= hi ? [lo, hi] : [hi, lo];
}

const g = globalThis as unknown as { botsStarted?: boolean };

export function startBots() {
  if (g.botsStarted) return;
  g.botsStarted = true;

  const [lo, hi] = parseRange(process.env.ONLINE_BOTS);
  if (hi > 0) {
    let count = lo + Math.floor(Math.random() * (hi - lo + 1));
    const tick = () => {
      // Плавно «гуляет» в пределах диапазона: ±1 раз в несколько минут, как живые заходы/уходы
      if (Math.random() < 0.08) count = Math.max(lo, Math.min(hi, count + (Math.random() < 0.5 ? -1 : 1)));
      for (let i = 1; i <= count; i++) void touchOnline(`b:${i}`).catch(() => {});
    };
    tick();
    setInterval(tick, 20_000).unref();
  }

  // Само-пинг через публичный адрес: Render считает это входящим трафиком и не усыпляет сервис
  const base = (process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");
  if (/^https:\/\//.test(base)) {
    const ping = () => fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15_000) }).catch(() => {});
    setTimeout(ping, 60_000).unref();
    setInterval(ping, 8 * 60_000).unref();
    console.log(`> keep-alive: ${base}/api/health каждые 8 минут`);
  }
}
