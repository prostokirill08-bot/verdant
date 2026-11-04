import { route } from "@/server/http";
import { db } from "@/server/db";
import { publicUser, PUBLIC_USER_SELECT } from "@/server/security/privacy";

// Лента последних выигрышей всех игроков (для главной). Без сидов и личных данных; сотрудники и анонимные игроки — «Скрытый игрок».
export const GET = route({ rate: { key: "feed", limit: 120, window: 60 } }, async () => {
  const rows = await db.round.findMany({
    where: { status: "WON", multiplier: { gte: 1.5 } }, orderBy: { settledAt: "desc" }, take: 24,
    select: { id: true, gameSlug: true, payout: true, multiplier: true, user: { select: PUBLIC_USER_SELECT } },
  });
  return { wins: rows.map((r) => ({ id: r.id, game: r.gameSlug, payout: r.payout, multiplier: Number(r.multiplier), ...publicUser(r.user) })) };
});
