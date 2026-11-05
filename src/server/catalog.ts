import { db } from "./db";
import { GAMES, isGameSlug, type GameCategory } from "@/lib/games";

const CATS: GameCategory[] = ["slots", "originals", "table"];
export const isCategory = (c: unknown): c is GameCategory => typeof c === "string" && (CATS as string[]).includes(c);

const cache = globalThis as unknown as { __vdCats?: { at: number; map: Map<string, GameCategory> }; __vdPop?: { at: number; map: Record<string, number> } };

/** Категория каждой игры: переопределение из админки или значение из каталога. Кэш 30 секунд. */
export async function gameCategories(): Promise<Map<string, GameCategory>> {
  if (cache.__vdCats && Date.now() - cache.__vdCats.at < 30_000) return cache.__vdCats.map;
  const rows = await db.game.findMany({ select: { slug: true, category: true } });
  const map = new Map<string, GameCategory>();
  for (const r of rows) if (isGameSlug(r.slug)) map.set(r.slug, isCategory(r.category) ? r.category : GAMES[r.slug].category);
  cache.__vdCats = { at: Date.now(), map };
  return map;
}
export const resetCategoryCache = () => { cache.__vdCats = undefined; };

/** Популярность: число завершённых раундов по каждой игре за 7 дней (реальные данные). Кэш 5 минут. */
export async function gamePopularity(): Promise<Record<string, number>> {
  if (cache.__vdPop && Date.now() - cache.__vdPop.at < 300_000) return cache.__vdPop.map;
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const rows = await db.round.groupBy({ by: ["gameSlug"], where: { createdAt: { gte: since }, status: { in: ["WON", "LOST"] } }, _count: true });
  const map: Record<string, number> = {};
  for (const r of rows) map[r.gameSlug] = r._count;
  cache.__vdPop = { at: Date.now(), map };
  return map;
}
