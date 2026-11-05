"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GameCard } from "./GameCard";
import { GameRow } from "./GameRow";
import { CATEGORY_NAMES, GAMES, type GameCategory, type GameSlug } from "@/lib/games";
import { useGameModal } from "./GameModal";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";

export type CatalogItem = { slug: GameSlug; title: string; tagline: string; enabled: boolean; category: GameCategory; addedAt: string; popularity: number };
type Tab = "all" | GameCategory | "fav" | "recent" | "popular";
type Sort = "popular" | "new" | "name";
const TABS: [Tab, string][] = [["all", "Все игры"], ["slots", CATEGORY_NAMES.slots], ["originals", CATEGORY_NAMES.originals], ["table", CATEGORY_NAMES.table], ["fav", "Избранное"], ["recent", "Недавно играли"], ["popular", "Популярное"]];
const SORTS: [Sort, string][] = [["popular", "По популярности"], ["new", "По новизне"], ["name", "По названию"]];
const isTab = (x?: string | null): x is Tab => TABS.some(([k]) => k === x);
const isSort = (x?: string | null): x is Sort => SORTS.some(([k]) => k === x);
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();

/**
 * Каталог: поиск по названию и описанию, категории, сортировка по популярности (раунды за 7 дней на сервере),
 * новизне (дата появления игры) и названию; разделы «Избранное», «Недавно играли», «Популярное».
 * Состояние фильтров хранится в адресе страницы — ссылкой можно поделиться, «Назад» возвращает фильтр.
 */
export function Catalog({ games, initial }: { games: CatalogItem[]; initial: { cat?: string; q?: string; sort?: string } }) {
  const router = useRouter(); const path = usePathname();
  const [q, setQ] = useState(initial.q ?? "");
  const [cat, setCat] = useState<Tab>(isTab(initial.cat) ? initial.cat : "all");
  const [sort, setSort] = useState<Sort>(isSort(initial.sort) ? initial.sort : "popular");
  const { favs } = useGameModal(); const { user } = useAuth();
  const [recent, setRecent] = useState<GameSlug[]>([]);
  useEffect(() => {
    if (!user) { setRecent([]); return; }
    api<{ recent: { slug: string }[] }>("/api/me/recent").then((r) => setRecent(r.recent.map((x) => x.slug).filter((s): s is GameSlug => s in GAMES))).catch(() => {});
  }, [user]);

  // Фильтры → адрес страницы (без перезагрузки)
  useEffect(() => {
    const sp = new URLSearchParams();
    if (cat !== "all") sp.set("cat", cat); if (q.trim()) sp.set("q", q.trim()); if (sort !== "popular") sp.set("sort", sort);
    const url = `${path}${sp.size ? `?${sp}` : ""}`;
    const t = setTimeout(() => router.replace(url, { scroll: false }), 250);
    return () => clearTimeout(t);
  }, [cat, q, sort, path, router]);

  const bySlug = useMemo(() => new Map(games.map((g) => [g.slug, g])), [games]);
  const popularTop = useMemo(() => [...games].filter((g) => g.popularity > 0).sort((a, b) => b.popularity - a.popularity).slice(0, 8), [games]);
  const inTab = (t: Tab, g: CatalogItem) =>
    t === "all" ? true : t === "fav" ? favs.includes(g.slug) : t === "recent" ? recent.includes(g.slug) : t === "popular" ? popularTop.some((p) => p.slug === g.slug) : g.category === t;
  const list = useMemo(() => {
    const needle = norm(q);
    const filtered = games.filter((g) => inTab(cat, g) && (!needle || norm(`${g.title} ${g.tagline} ${GAMES[g.slug].name} ${GAMES[g.slug].blurb}`).includes(needle)));
    if (cat === "recent" && sort === "popular") return filtered.sort((a, b) => recent.indexOf(a.slug) - recent.indexOf(b.slug));   // недавние — в порядке игры
    return filtered.sort((a, b) => sort === "name" ? a.title.localeCompare(b.title, "ru") : sort === "new" ? +new Date(b.addedAt) - +new Date(a.addedAt) || a.title.localeCompare(b.title) : b.popularity - a.popularity || a.title.localeCompare(b.title));
  }, [games, q, cat, sort, favs, recent]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (t: Tab) => games.filter((g) => inTab(t, g)).length;
  const rows = (slugs: GameSlug[]) => slugs.map((s) => bySlug.get(s)).filter((g): g is CatalogItem => !!g).map((g) => ({ slug: g.slug, title: g.title, enabled: g.enabled }));
  const showShelves = cat === "all" && !q.trim();
  const empty = cat === "fav" ? "Пока пусто — нажми ♥ на карточке игры, чтобы добавить её сюда." : cat === "recent" ? (user ? "Ты ещё не играл — выбери любую игру." : "Войди, чтобы видеть недавние игры.") : `Ничего не нашлось${q ? ` по запросу «${q}»` : ""}.`;
  return (
    <div className="catalog-shell grid gap-5">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="catalog-search flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#28325f] bg-[#0f1633] px-3 focus-within:border-[#3ee08f] sm:max-w-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-muted" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input id="game-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию" aria-label="Поиск игр" className="w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-muted" />
            {q && <button type="button" onClick={() => setQ("")} className="text-muted hover:text-white" aria-label="Очистить поиск">✕</button>}
          </label>
          <label className="catalog-sort flex h-11 items-center gap-2 rounded-xl border border-[#28325f] bg-[#0f1633] px-3 text-[13.5px]">
            <span className="text-muted">Сортировка</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Сортировка" data-testid="catalog-sort" className="bg-transparent font-semibold text-white outline-none [&>option]:bg-[#0f1633]">
              {SORTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Категории">
          {TABS.map(([k, t]) => (
            <button key={k} role="tab" aria-selected={cat === k} onClick={() => setCat(k)} data-testid={`cat-${k}`}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${cat === k ? "bg-[#3ee08f] text-[#03170c] shadow-[0_8px_24px_-10px_#3ee08f]" : "bg-[#0f1633] text-soft ring-1 ring-[#28325f] hover:text-white"}`}>
              {t}<span className={`rounded-md px-1.5 text-[11px] font-bold ${cat === k ? "bg-black/15" : "bg-raised text-muted"}`}>{count(k)}</span>
            </button>
          ))}
        </div>
      </div>

      {showShelves && (
        <div className="grid gap-6">
          {recent.length > 0 && <GameRow title="Недавно играли" emoji="◷" games={rows(recent)} />}
          {favs.length > 0 && <GameRow title="Избранное" emoji="♥" games={rows(favs)} />}
          {popularTop.length > 0 && <GameRow title="Популярное за неделю" emoji="✦" games={rows(popularTop.map((g) => g.slug))} />}
          <h2 className="font-display text-[18px] font-bold">Все игры</h2>
        </div>
      )}
      {list.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5" data-testid="catalog-grid">
          {list.map((g, i) => <GameCard key={g.slug} slug={g.slug} title={g.title} enabled={g.enabled} index={i} />)}
        </div>
      ) : <p className="rounded-2xl border border-line bg-panel p-6 text-center text-muted">{empty}</p>}
    </div>
  );
}
