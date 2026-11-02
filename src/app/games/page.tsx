import { db } from "@/server/db";
import { Catalog } from "@/components/games/Catalog";
import { isGameSlug, type GameSlug } from "@/lib/games";

export const dynamic = "force-dynamic";
export const metadata = { title: "Каталог игр" };

export default async function GamesPage() {
  const games = await db.game.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="grid gap-6">
      <div><h1 className="font-display text-[28px] font-bold">Каталог игр</h1><p className="mt-1 text-muted">Все игры работают на демо-баллах. Результат каждого раунда считает сервер.</p></div>
      <Catalog games={games.filter((g) => isGameSlug(g.slug)).map((g) => ({ slug: g.slug as GameSlug, title: g.title, tagline: g.tagline, enabled: g.enabled }))} />
    </div>
  );
}
