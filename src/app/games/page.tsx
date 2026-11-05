import { db } from "@/server/db";
import { Catalog, type CatalogItem } from "@/components/games/Catalog";
import { GAMES, isGameSlug, type GameSlug } from "@/lib/games";
import { gameCategories, gamePopularity } from "@/server/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Каталог игр" };

export default async function GamesPage({ searchParams }: { searchParams: Promise<{ cat?: string; q?: string; sort?: string }> }) {
  const [sp, games, cats, pop] = await Promise.all([searchParams, db.game.findMany({ orderBy: { sortOrder: "asc" } }), gameCategories(), gamePopularity()]);
  const items: CatalogItem[] = games.filter((g) => isGameSlug(g.slug)).map((g) => {
    const slug = g.slug as GameSlug;
    return { slug, title: g.title, tagline: g.tagline, enabled: g.enabled, category: cats.get(slug) ?? GAMES[slug].category, addedAt: g.addedAt.toISOString(), popularity: pop[slug] ?? 0 };
  });
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-[28px] font-bold">Каталог <span className="text-gradient">игр</span></h1>
        <p className="mt-1 text-muted">Все игры работают на виртуальных демо-кредитах. Результат каждого раунда считает сервер.</p>
      </div>
      <Catalog initial={{ cat: sp.cat, q: sp.q?.slice(0, 60), sort: sp.sort }} games={items} />
    </div>
  );
}
