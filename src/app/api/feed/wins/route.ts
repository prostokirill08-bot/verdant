import { route } from "@/server/http";
import { db } from "@/server/db";

// Лента последних выигрышей всех игроков (для главной). Без сидов и личных данных, кроме ника.
export const GET = route({ rate: { key: "feed", limit: 120, window: 60 } }, async () => {
  const rows = await db.round.findMany({
    where: { status: "WON", multiplier: { gte: 1.5 } }, orderBy: { settledAt: "desc" }, take: 24,
    select: { id: true, gameSlug: true, payout: true, multiplier: true, user: { select: { username: true, avatar: true } } },
  });
  return { wins: rows.map((r) => ({ id: r.id, game: r.gameSlug, payout: r.payout, multiplier: Number(r.multiplier), user: r.user.username, avatar: r.user.avatar })) };
});
