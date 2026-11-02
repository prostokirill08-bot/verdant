"use client";
import { useMemo, useState } from "react";
import { GameCard } from "./GameCard";
import type { GameSlug } from "@/lib/games";

export function Catalog({ games }: { games: { slug: GameSlug; title: string; tagline: string; enabled: boolean }[] }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => games.filter((g) => (g.title + " " + g.tagline).toLowerCase().includes(q.trim().toLowerCase())), [games, q]);
  return (
    <div className="grid gap-5">
      <label className="flex h-11 max-w-md items-center gap-2 rounded-xl border border-line bg-panel px-3 focus-within:border-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-muted" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        <input id="game-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти игру" className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted" />
      </label>
      {list.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((g, i) => <GameCard key={g.slug} {...g} index={i} />)}
        </div>
      ) : <p className="text-muted">Ничего не нашлось по запросу «{q}».</p>}
    </div>
  );
}
