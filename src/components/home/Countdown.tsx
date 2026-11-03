"use client";
import { useEffect, useState } from "react";

/** Обратный отсчёт: по умолчанию — до Нового года по часам посетителя. До монтирования ничего не рисуем — нет расхождения с сервером. */
export function Countdown({ to, label = "До Нового года", compact }: { to?: number | string; label?: string; compact?: boolean }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const target = () => (to !== undefined ? new Date(to).getTime() : new Date(new Date().getFullYear() + 1, 0, 1).getTime());
    const tick = () => setLeft(Math.max(0, target() - Date.now()));
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [to]);
  if (left === null) return <div className={compact ? "h-[50px]" : "h-[66px]"} />;
  const d = Math.floor(left / 86400000), h = Math.floor(left / 3600000) % 24, m = Math.floor(left / 60000) % 60, s = Math.floor(left / 1000) % 60;
  const cells: [number, string][] = [[d, "дней"], [h, "часов"], [m, "минут"], [s, "секунд"]];
  return (
    <div className="flex items-end gap-1.5 sm:gap-2" aria-label={label}>
      {cells.map(([v, l]) => (
        <div key={l} className={`grid place-items-center rounded-2xl bg-black/35 px-2 ring-1 ring-white/15 backdrop-blur ${compact ? "min-w-[46px] py-1" : "min-w-[58px] py-1.5"}`}>
          <span className={`font-mono font-bold tabular text-gold ${compact ? "text-[17px]" : "text-[22px]"}`}>{String(v).padStart(2, "0")}</span>
          <span className="text-[10px] uppercase tracking-wider text-white/70">{l}</span>
        </div>
      ))}
    </div>
  );
}
