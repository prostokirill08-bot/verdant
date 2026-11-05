import { route } from "@/server/http";
import { db } from "@/server/db";
import { isGameSlug } from "@/lib/games";

/** История игровых раундов игрока (по 30, курсор — id), с фильтром по игре и результату. */
export const GET = route({ auth: true, rate: { key: "rounds-hist", limit: 120, window: 60 } }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const game = sp.get("game"); const result = sp.get("result"); const cursor = sp.get("cursor");
  const rows = await db.round.findMany({
    where: { userId: user!.id, ...(game && isGameSlug(game) ? { gameSlug: game } : {}), ...(result === "won" ? { status: "WON" } : result === "lost" ? { status: "LOST" } : { status: { not: "ACTIVE" } }) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31,
    ...(cursor && /^[a-z0-9]{10,40}$/.test(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, gameSlug: true, betAmount: true, payout: true, multiplier: true, status: true, createdAt: true, settledAt: true },
  });
  return { items: rows.slice(0, 30).map((r) => ({ ...r, multiplier: r.multiplier.toString() })), nextCursor: rows.length > 30 ? rows[29]!.id : null };
});
