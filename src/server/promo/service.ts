import { randomInt } from "node:crypto";
import { db } from "../db";
import { HttpError } from "../http";
import { GUEST_DOMAIN } from "@/lib/guest";
import { weekBounds } from "@/lib/week";
import { applyEntry, withUserTx } from "../wallet/ledger";
import { JACKPOT_BASE, jackpotPool, KEY_MIN_BET, KEY_ODDS, KEYS_NEEDED, takeJackpot } from "./keys";

// ---------- Сундук со снежными ключами ----------
/** Призы сундука (в копейках) и их веса. «grand» — весь накопленный джекпот. */
export const CHEST_PRIZES: { amount: bigint | "grand"; weight: number }[] = [
  { amount: 5_000n, weight: 30 }, { amount: 10_000n, weight: 25 }, { amount: 25_000n, weight: 20 },
  { amount: 50_000n, weight: 13 }, { amount: 100_000n, weight: 8 }, { amount: 250_000n, weight: 3 }, { amount: "grand", weight: 1 },
];
const WEIGHT = CHEST_PRIZES.reduce((s, p) => s + p.weight, 0);

export async function openChest(userId: string) {
  const res = await withUserTx(userId, async (tx) => {
    const st = await tx.promoState.findUnique({ where: { userId } });
    if (!st || st.keys < KEYS_NEEDED) throw new HttpError(400, `Нужно ${KEYS_NEEDED} ключа — пока собрано ${st?.keys ?? 0}`, "no_keys");
    let x = randomInt(WEIGHT); let slot = 0;
    for (let i = 0; i < CHEST_PRIZES.length; i++) { if ((x -= CHEST_PRIZES[i]!.weight) < 0) { slot = i; break; } }
    const grand = CHEST_PRIZES[slot]!.amount === "grand";
    const amount = grand ? await takeJackpot() : (CHEST_PRIZES[slot]!.amount as bigint);
    const upd = await tx.promoState.update({ where: { userId }, data: { keys: { decrement: KEYS_NEEDED }, opened: { increment: 1 } } });
    const { entry } = await applyEntry(tx, { userId, type: "PROMO", amount, idempotencyKey: `chest:${userId}:${upd.opened}`, note: grand ? "Сундук: джекпот" : "Сундук со снежными ключами" });
    await tx.promoWin.create({ data: { userId, kind: grand ? "grand" : "chest", amount } });
    return { prize: amount, grand, slot, keys: upd.keys, balance: entry.balanceAfter };
  });
  return res;
}

// ---------- Турнир недели ----------
// Неделя — с понедельника 00:00 по МСК. Очки — лучший множитель одного раунда со ставкой от 1 ₽.
export const TOURNAMENT_PRIZES = [5_000_000n, 2_500_000n, 1_000_000n, 250_000n, 250_000n, 250_000n, 250_000n, 250_000n, 250_000n, 250_000n];
const DAY = 24 * 3600 * 1000;

type Row = { place: number; userId: string; user: string; avatar: string; mult: number; game: string; prize: bigint };
async function leaderboard(start: Date, end: Date, take = 10): Promise<Row[]> {
  const where = { status: "WON" as const, betAmount: { gte: KEY_MIN_BET }, settledAt: { gte: start, lt: end }, user: { email: { not: { endsWith: `@${GUEST_DOMAIN}` } } } };
  const top = await db.round.groupBy({ by: ["userId"], where, _max: { multiplier: true }, orderBy: { _max: { multiplier: "desc" } }, take });
  if (!top.length) return [];
  const [users, rounds] = await Promise.all([
    db.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, select: { id: true, username: true, avatar: true } }),
    Promise.all(top.map((t) => db.round.findFirst({ where: { ...where, userId: t.userId, multiplier: t._max.multiplier ?? 0 }, select: { gameSlug: true }, orderBy: { settledAt: "asc" } }))),
  ]);
  return top.map((t, i) => {
    const u = users.find((x) => x.id === t.userId);
    return { place: i + 1, userId: t.userId, user: u?.username ?? "—", avatar: u?.avatar ?? "orbit", mult: Number(t._max.multiplier ?? 0), game: rounds[i]?.gameSlug ?? "", prize: TOURNAMENT_PRIZES[i] ?? 0n };
  });
}

const cache = globalThis as unknown as { tour?: { at: number; week: string; rows: Row[] } };
export async function currentTournament() {
  const w = weekBounds();
  if (!cache.tour || cache.tour.week !== w.id || Date.now() - cache.tour.at > 30_000) cache.tour = { at: Date.now(), week: w.id, rows: await leaderboard(w.start, w.end) };
  return { week: w.id, startsAt: w.start, endsAt: w.end, prizes: TOURNAMENT_PRIZES, top: cache.tour.rows };
}

/** Выплата призов за прошедшую неделю. Повторный запуск ничего не делает: ключ журнала и (week, place) уникальны. */
export async function payTournament(now = Date.now()) {
  const prev = weekBounds(now - 7 * DAY);
  if (now - prev.end.getTime() > 6 * DAY) return 0;
  const paidAlready = await db.promoWin.count({ where: { week: prev.id } });
  if (paidAlready >= TOURNAMENT_PRIZES.length) return 0;
  let paid = 0;
  for (const r of await leaderboard(prev.start, prev.end)) {
    if (await db.promoWin.findUnique({ where: { week_place: { week: prev.id, place: r.place } } })) continue;
    await withUserTx(r.userId, async (tx) => {
      const { duplicate } = await applyEntry(tx, { userId: r.userId, type: "PROMO", amount: r.prize, idempotencyKey: `tour:${prev.id}:${r.place}`, note: `Турнир недели: ${r.place} место` });
      if (!duplicate) await tx.promoWin.create({ data: { userId: r.userId, kind: "tournament", amount: r.prize, week: prev.id, place: r.place } });
    });
    paid++;
  }
  return paid;
}

// ---------- Сводка для страницы «Бонусы» ----------
export async function promoSummary(userId?: string) {
  const [pool, tour, wins, st] = await Promise.all([
    jackpotPool(), currentTournament(),
    db.promoWin.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: { id: true, kind: true, amount: true, place: true, createdAt: true, user: { select: { username: true, avatar: true } } } }),
    userId ? db.promoState.findUnique({ where: { userId } }) : null,
  ]);
  const meRow = userId ? tour.top.find((r) => r.userId === userId) : undefined;
  let best: number | null = null;
  if (userId && !meRow) {
    const r = await db.round.aggregate({ where: { userId, status: "WON", betAmount: { gte: KEY_MIN_BET }, settledAt: { gte: tour.startsAt, lt: tour.endsAt } }, _max: { multiplier: true } });
    best = r._max.multiplier ? Number(r._max.multiplier) : null;
  }
  return {
    keys: { have: st?.keys ?? 0, need: KEYS_NEEDED, odds: KEY_ODDS, minBet: KEY_MIN_BET, opened: st?.opened ?? 0 },
    jackpot: { pool, base: JACKPOT_BASE },
    chest: CHEST_PRIZES.map((p) => ({ amount: p.amount === "grand" ? "grand" : p.amount, chance: p.weight / WEIGHT })),
    tournament: { ...tour, top: tour.top.map(({ userId: _u, ...r }) => r), me: userId ? { place: meRow?.place ?? null, best: meRow?.mult ?? best } : null },
    wins: wins.map((w) => ({ id: w.id, kind: w.kind, amount: w.amount, place: w.place, at: w.createdAt, user: w.user.username, avatar: w.user.avatar })),
  };
}

export async function myKeys(userId: string) {
  const st = await db.promoState.findUnique({ where: { userId } });
  return { keys: st?.keys ?? 0, need: KEYS_NEEDED };
}
