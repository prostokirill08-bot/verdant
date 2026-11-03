import { route } from "@/server/http";
import { db } from "@/server/db";
import { isGameSlug } from "@/lib/games";

// Каталог для карточки игры: включена ли, лимиты ставок, преимущество (для RTP)
export const GET = route({ rate: { key: "games", limit: 120, window: 60 } }, async () => {
  const rows = await db.game.findMany({ orderBy: [{ sortOrder: "asc" }, { slug: "asc" }] });
  return { games: rows.filter((g) => isGameSlug(g.slug)).map((g) => ({ slug: g.slug, title: g.title, tagline: g.tagline, enabled: g.enabled, minBet: g.minBet, maxBet: g.maxBet, houseEdgeBp: g.houseEdgeBp })) };
});
