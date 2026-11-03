"use client";
import { useMemo, useState } from "react";
import { GameCard } from "./GameCard";
import { CATEGORY_NAMES, GAMES, type GameCategory, type GameSlug } from "@/lib/games";
import { useGameModal } from "./GameModal";

type Item = { slug: GameSlug; title: string; tagline: string; enabled: boolean };
type Tab = GameCategory | "all" | "fav";
const TABS: [Tab, string, string][] = [["all", "Все игры", "❄️"], ["slots", CATEGORY_NAMES.slots, "🎁"], ["originals", CATEGORY_NAMES.originals, "🎄"], ["fav", "Избранное", "❤️"]];

export function Catalog({ games, initialCat }: { games: Item[]; initialCat?: string }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Tab>(initialCat === "slots" || initialCat === "originals" || initialCat === "fav" ? initialCat : "all");
  const { favs } = useGameModal();
  const list = useMemo(() => games.filter((g) => (cat === "all" || (cat === "fav" ? favs.includes(g.slug) : GAMES[g.slug].category === cat)) && (g.title + " " + g.tagline + " " + GAMES[g.slug].blurb).toLowerCase().includes(q.trim().toLowerCase())), [games, q, cat, favs]);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([k, t, e]) => (
          <button key={k} onClick={() => setCat(k)} className={`flex h-10 items-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold transition-colors ${cat === k ? "bg-brand-gradient text-white shadow-[0_8px_24px_-10px_#e8263f]" : "bg-panel text-soft ring-1 ring-line hover:text-white"}`}>
            <span aria-hidden>{e}</span>{t}
          </button>
        ))}
        <label className="ml-auto flex h-10 w-full items-center gap-2 rounded-xl border border-line bg-panel px-3 focus-within:border-brand sm:w-64">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-muted" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input id="game-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти игру" className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted" />
        </label>
      </div>
      {list.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((g, i) => <GameCard key={g.slug} slug={g.slug} title={g.title} enabled={g.enabled} index={i} />)}
        </div>
      ) : <p className="text-muted">{cat === "fav" && !q ? "Пока пусто — нажми ❤️ в карточке игры, чтобы добавить её сюда." : `Ничего не нашлось${q ? ` по запросу «${q}»` : ""}.`}</p>}
    </div>
  );
}
