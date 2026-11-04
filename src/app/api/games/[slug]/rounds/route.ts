import { route, HttpError } from "@/server/http";
import { db } from "@/server/db";
import { publicUser, PUBLIC_USER_SELECT } from "@/server/security/privacy";
import { roundView } from "@/server/games/rounds";
import { isGameSlug } from "@/lib/games";

// История раундов игры: свои (с данными для проверки) или лента всех игроков (без сидов)
export const GET = route({ rate: { key: "rounds", limit: 120, window: 60 } }, async ({ req, user, params }) => {
  const slug = params.slug!;
  if (!isGameSlug(slug)) throw new HttpError(404, "Игра не найдена", "not_found");
  const scope = req.nextUrl.searchParams.get("scope") === "mine" ? "mine" : "all";
  if (scope === "mine") {
    if (!user) return { rounds: [] };
    const rows = await db.round.findMany({ where: { userId: user.id, gameSlug: slug, status: { not: "ACTIVE" } }, orderBy: { createdAt: "desc" }, take: 25, include: { seedPair: true, crash: true } });
    return { rounds: rows.map(roundView) };
  }
  const rows = await db.round.findMany({ where: { gameSlug: slug, status: { in: ["WON", "LOST"] } }, orderBy: { settledAt: "desc" }, take: 25, include: { user: { select: PUBLIC_USER_SELECT } } });
  return { rounds: rows.map((r) => ({ id: r.id, ...publicUser(r.user), bet: r.betAmount, payout: r.payout, multiplier: Number(r.multiplier), status: r.status, at: r.settledAt ?? r.createdAt })) };
});
