"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { points } from "@/lib/format";
import { GAMES, isGameSlug } from "@/lib/games";
import { useGameModal } from "@/components/games/GameModal";

type Win = { id: string; game: string; payout: string; multiplier: number; user: string };

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
      <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-2 bg-gradient-to-r from-panel via-panel to-transparent pl-4 pr-4 text-[12px] sm:pr-8 font-bold uppercase tracking-wider text-accent">
        <span className="size-2 animate-pulse rounded-full bg-accent" /><span className="hidden sm:inline">Выигрыши</span>
      </div>
      <div className="flex w-max gap-3 pl-10 sm:pl-44 [animation:ticker_60s_linear_infinite] hover:[animation-play-state:paused]">
        {row.map((w, i) => {
          const g = GAMES[w.game as keyof typeof GAMES];
          return (
            <Link key={w.id + i} href={`/games/${w.game}`} onClick={(e) => { if (!isGameSlug(w.game) || e.metaKey || e.ctrlKey) return; e.preventDefault(); openGame(w.game); }} className="flex shrink-0 items-center gap-2 rounded-xl bg-raised/60 py-1 pl-1 pr-3 hover:bg-raised">
              <Image src={g.cover} alt="" width={28} height={36} className="h-9 w-7 rounded-md object-cover" />
              <span className="text-[13px] leading-tight"><span className="block text-soft">{w.user}</span><span className="font-mono font-semibold text-accent">+{points(w.payout)}</span> <span className="font-mono text-[11px] text-muted">{w.multiplier.toFixed(2)}×</span></span>
            </Link>
          );
        })}
      </div>
      <style>{`@keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </section>
  );
}
