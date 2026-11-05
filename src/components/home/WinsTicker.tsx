"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { points } from "@/lib/format";
import { GAMES, isGameSlug } from "@/lib/games";
import { useGameModal } from "@/components/games/GameModal";

type Win = { id: string; game: string; payout: string; multiplier: number; user: string };
/** Уровень выигрыша по множителю — подпись и цвет в ленте. */
const TIERS: [number, string, string][] = [[200, "Ультра", "#ff3df0"], [100, "Легендарный", "#ff5cf0"], [50, "Мега", "#ff5c7a"], [25, "Огромный", "#ff8a3d"], [10, "Большой", "#ffd166"], [3, "Отличный", "#3ee08f"], [0, "Выигрыш", "#8fdcff"]];
const tier = (m: number) => TIERS.find(([x]) => m >= x)!;

/** Бегущая лента последних выигрышей (обновляется раз в 15 секунд). */
export function WinsTicker() {
  const [wins, setWins] = useState<Win[]>([]);
  const { open: openGame } = useGameModal();
  useEffect(() => {
    const load = () => api<{ wins: Win[] }>("/api/feed/wins").then((r) => setWins(r.wins.filter((w) => isGameSlug(w.game)))).catch(() => {});
    load(); const t = setInterval(load, 15000); return () => clearInterval(t);
  }, []);
  if (!wins.length) return null;
  const row = [...wins, ...wins];
  return (
    <section aria-label="Последние выигрыши" className="relative overflow-hidden rounded-2xl border border-line bg-panel/70 py-2.5 backdrop-blur">
      <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-2 bg-[linear-gradient(90deg,var(--color-panel)_72%,transparent)] pl-4 pr-6 text-[12px] sm:pr-12 font-bold uppercase tracking-wider text-accent">
        <span className="size-2 animate-pulse rounded-full bg-accent" /><span className="hidden sm:inline">Выигрыши</span>
      </div>
      <div className="flex w-max gap-3 pl-10 sm:pl-44 [animation:ticker_60s_linear_infinite] hover:[animation-play-state:paused]">
        {row.map((w, i) => {
          const g = GAMES[w.game as keyof typeof GAMES];
          return (
            <Link key={w.id + i} href={`/games/${w.game}`} onClick={(e) => { if (!isGameSlug(w.game) || e.metaKey || e.ctrlKey) return; e.preventDefault(); openGame(w.game); }} className="ticker-item flex w-[124px] shrink-0 flex-col items-center gap-1 rounded-xl bg-raised/60 px-2 pb-2 pt-1.5 text-center hover:bg-raised">
              <Image src={g.cover} alt="" width={40} height={52} className="h-[52px] w-10 rounded-lg object-cover ring-1 ring-white/10" />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tier(w.multiplier)[2] }}>{tier(w.multiplier)[1]}</span>
              <span className="font-mono text-[13.5px] font-bold leading-none text-white">{points(w.payout)}</span>
              <span className="w-full truncate text-[10.5px] text-muted">{w.user} · {w.multiplier.toFixed(2)}×</span>
            </Link>
          );
        })}
      </div>
      <style>{`@keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </section>
  );
}
