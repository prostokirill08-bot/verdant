import { z } from "zod";
import { route } from "@/server/http";
import { db } from "@/server/db";

const q = z.object({ cursor: z.string().max(40).optional(), type: z.enum(["ALL", "DEPOSIT", "DEMO_GRANT", "PROMO", "BET", "WIN", "REFUND", "ADMIN_ADJUST"]).default("ALL") });

/** История операций с постраничной загрузкой по курсору. */
export const GET = route({ auth: true }, async ({ req, user }) => {
  const p = q.parse(Object.fromEntries(req.nextUrl.searchParams));
  const items = await db.ledgerEntry.findMany({
    where: { userId: user!.id, ...(p.type !== "ALL" ? { type: p.type } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31,
    ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
    select: { id: true, type: true, amount: true, balanceAfter: true, note: true, roundId: true, createdAt: true },
  });
  const roundIds = items.map((i) => i.roundId).filter(Boolean) as string[];
  const rounds = roundIds.length ? await db.round.findMany({ where: { id: { in: roundIds } }, select: { id: true, gameSlug: true, multiplier: true } }) : [];
  const byId = new Map(rounds.map((r) => [r.id, r]));
  return {
    items: items.slice(0, 30).map((i) => ({ ...i, game: i.roundId ? byId.get(i.roundId)?.gameSlug : null, multiplier: i.roundId ? byId.get(i.roundId)?.multiplier.toString() : null })),
    nextCursor: items.length > 30 ? items[29]!.id : null,
  };
});
