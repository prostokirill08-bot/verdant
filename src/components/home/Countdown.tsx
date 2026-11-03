"use client";
import { useEffect, useState } from "react";

/** Отсчёт до Нового года по часам посетителя. До монтирования ничего не рисуем — нет расхождения с сервером. */
export function Countdown() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => { const now = new Date(); const ny = new Date(now.getFullYear() + 1, 0, 1); setLeft(ny.getTime() - now.getTime()); };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, []);
  if (left === null) return <div className="h-[66px]" />;
  const d = Math.floor(left / 86400000), h = Math.floor(left / 3600000) % 24, m = Math.floor(left / 60000) % 60, s = Math.floor(left / 1000) % 60;
  const cells: [number, string][] = [[d, "дней"], [h, "часов"], [m, "минут"], [s, "секунд"]];
  return (
    <div className="flex items-end gap-2" aria-label="До Нового года">
      {cells.map(([v, l]) => (
        <div key={l} className="grid min-w-[58px] place-items-center rounded-2xl bg-black/35 px-2 py-1.5 ring-1 ring-white/15 backdrop-blur">
          <span className="font-mono text-[22px] font-bold tabular text-gold">{String(v).padStart(2, "0")}</span>
          <span className="text-[10.5px] uppercase tracking-wider text-white/70">{l}</span>
        </div>
      ))}
    </div>
  );
}
