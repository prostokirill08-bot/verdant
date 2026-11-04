"use client";
import { useMemo, useState } from "react";
import { GameCard } from "./GameCard";
import { CATEGORY_NAMES, GAMES, type GameCategory, type GameSlug } from "@/lib/games";
import { useGameModal } from "./GameModal";

type Item = { slug: GameSlug; title: string; tagline: string; enabled: boolean };
type Tab = GameCategory | "all" | "fav" | "new";
const TABS: [Tab, string, string][] = [["all", "Все игры", "❄️"], ["new", "Новинки", "✨"], ["slots", CATEGORY_NAMES.slots, "🎁"], ["table", CATEGORY_NAMES.table, "🃏"], ["originals", CATEGORY_NAMES.originals, "⚡"], ["fav", "Избранное", "❤️"]];
const isTab = (x?: string): x is Tab => TABS.some(([k]) => k === x);

export function Catalog({ games, initialCat }: { games: Item[]; initialCat?: string }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Tab>(isTab(initialCat) ? initialCat : "all");
  const { favs } = useGameModal();
  const inTab = (t: Tab, s: GameSlug) => t === "all" || (t === "fav" ? favs.includes(s) : t === "new" ? GAMES[s].badge === "Новинка" : GAMES[s].category === t);
  const list = useMemo(() => games.filter((g) => inTab(cat, g.slug) && (g.title + " " + g.tagline + " " + GAMES[g.slug].blurb).toLowerCase().includes(q.trim().toLowerCase())), // eslint-disable-line react-hooks/exhaustive-deps
    [games, q, cat, favs]);
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([k, t, e]) => (
          <button key={k} onClick={() => setCat(k)} className={`flex h-10 items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold transition-colors ${cat === k ? "bg-[#9bea50] text-[#071007] shadow-[0_8px_24px_-10px_#9bea50]" : "bg-[#0b1510] text-[#a5b8aa] ring-1 ring-[#263c2c] hover:text-white"}`}>
            <span aria-hidden>{e}</span>{t}
            <span className={`rounded-md px-1.5 text-[11px] font-bold ${cat === k ? "bg-white/20" : "bg-raised text-muted"}`}>{games.filter((g) => inTab(k, g.slug)).length}</span>
          </button>
        ))}
        <label className="ml-auto flex h-10 w-full items-center gap-2 rounded-lg border border-[#263c2c] bg-[#0b1510] px-3 focus-within:border-[#8be94e] sm:w-64">
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
