import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../http";
import { GUEST_DOMAIN } from "@/lib/guest";
import { weekBounds } from "@/lib/week";
import { HIDDEN_NAME, publicUser, PUBLIC_USER_SELECT } from "../security/privacy";
import { getSetting, putSetting } from "../settings";
import { notify, notifyMany } from "../progress/notify";
import { points } from "@/lib/format";
import { applyEntry, withUserTx } from "../wallet/ledger";
import { JACKPOT_BASE, jackpotPool, KEY_MIN_BET, KEY_PER_WAGER, KEYS_NEEDED, takeJackpot } from "./keys";

// ---------- Сундук со снежными ключами ----------
/**
 * Призы сундука (в копейках) и их веса из 1000. «grand» — весь накопленный джекпот (0,3%).
 * Средний сундук ≈ 60 ₽ + доля джекпота ≈ 135 ₽ при 25 000 ₽; ключ ≈ 34 ₽ на 2 000 ₽ ставок → ~1,7% оборота.
 */
export const CHEST_PRIZES: { amount: bigint | "grand"; weight: number }[] = [
  { amount: 1_000n, weight: 350 }, { amount: 2_500n, weight: 280 }, { amount: 5_000n, weight: 200 },
  { amount: 10_000n, weight: 100 }, { amount: 25_000n, weight: 50 }, { amount: 100_000n, weight: 17 }, { amount: "grand", weight: 3 },
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
// Неделя — с понедельника 00:00 по МСК. Очки — лучший множитель одного раунда со ставкой не меньше minBet.
// Призы — только виртуальные демо-кредиты. Настройки (вкл/выкл, призы, минимальная ставка) — в админке.
export const TOURNAMENT_PRIZES = [5_000_000n, 2_500_000n, 1_000_000n, 250_000n, 250_000n, 250_000n, 250_000n, 250_000n, 250_000n, 250_000n];
const DAY = 24 * 3600 * 1000;
export const tournamentSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(2).max(60),
  minBet: z.number().int().min(1).max(10_000_000),
  prizes: z.array(z.number().int().min(0).max(100_000_000)).max(50),
});
export type TournamentSettings = z.infer<typeof tournamentSchema>;
const TOUR_DEFAULTS: TournamentSettings = { enabled: true, title: "Турнир недели", minBet: Number(KEY_MIN_BET), prizes: TOURNAMENT_PRIZES.map(Number) };
export async function tournamentSettings(): Promise<TournamentSettings> {
  const parsed = tournamentSchema.partial().safeParse((await getSetting("tournament")) ?? {});
  return { ...TOUR_DEFAULTS, ...(parsed.success ? parsed.data : {}) };
}
export async function setTournamentSettings(patch: Partial<TournamentSettings>) {
  const next = tournamentSchema.parse({ ...(await tournamentSettings()), ...patch });
  await putSetting("tournament", next); cache.tour = undefined;
  return next;
}

type Row = { place: number; userId: string; publicId: string | null; user: string; avatar: string; mult: number; game: string; prize: bigint };
/** Таблица турнира: лучший множитель каждого игрока за период. Гости и сотрудники не участвуют. */
async function leaderboard(start: Date, end: Date, prizes: bigint[], minBet: bigint, take = 50): Promise<Row[]> {
  const where = { status: "WON" as const, betAmount: { gte: minBet }, settledAt: { gte: start, lt: end }, user: { role: "USER" as const, status: "ACTIVE" as const, email: { not: { endsWith: `@${GUEST_DOMAIN}` } } } };
  const top = await db.round.groupBy({ by: ["userId"], where, _max: { multiplier: true }, orderBy: { _max: { multiplier: "desc" } }, take });
  if (!top.length) return [];
  const [users, rounds] = await Promise.all([
    db.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, select: { id: true, publicId: true, ...PUBLIC_USER_SELECT } }),
    Promise.all(top.map((t) => db.round.findFirst({ where: { ...where, userId: t.userId, multiplier: t._max.multiplier ?? 0 }, select: { gameSlug: true }, orderBy: { settledAt: "asc" } }))),
  ]);
  return top.map((t, i) => {
    const u = users.find((x) => x.id === t.userId); const pub = u ? publicUser(u) : { user: "—", avatar: "orbit" };
    return { place: i + 1, userId: t.userId, publicId: u && pub.user !== HIDDEN_NAME ? u.publicId : null, ...pub, mult: Number(t._max.multiplier ?? 0), game: rounds[i]?.gameSlug ?? "", prize: prizes[i] ?? 0n };
  });
}

const cache = globalThis as unknown as { tour?: { at: number; week: string; rows: Row[] } };
/** Строка турнира недели в БД (создаётся при первом обращении; призы фиксируются на момент старта). */
async function ensureTournament(w: { id: string; start: Date; end: Date }) {
  const existing = await db.tournament.findUnique({ where: { id: w.id } });
  if (existing) return existing;
  const s = await tournamentSettings();
  return db.tournament.upsert({ where: { id: w.id }, update: {}, create: { id: w.id, title: s.title, startsAt: w.start, endsAt: w.end, prizes: s.prizes.map(String) } });
}
const prizesOf = (t: { prizes: unknown }) => (Array.isArray(t.prizes) ? (t.prizes as (string | number)[]).map((x) => BigInt(x)) : TOURNAMENT_PRIZES);

export async function currentTournament() {
  const w = weekBounds(); const s = await tournamentSettings();
  const t = await ensureTournament(w); const prizes = prizesOf(t);
  if (!cache.tour || cache.tour.week !== w.id || Date.now() - cache.tour.at > 30_000) cache.tour = { at: Date.now(), week: w.id, rows: s.enabled ? await leaderboard(w.start, w.end, prizes, BigInt(s.minBet)) : [] };
  return { week: w.id, title: t.title, enabled: s.enabled, minBet: BigInt(s.minBet), startsAt: w.start, endsAt: w.end, prizes, top: cache.tour.rows };
}

/**
 * Итоги прошедшей недели: выплата призов (демо-кредиты), таблица в истории и уведомления участникам.
 * Повторный запуск ничего не делает: ключ журнала, (week, place) и статус турнира уникальны.
 */
export async function payTournament(now = Date.now()) {
  const prev = weekBounds(now - 7 * DAY);
  if (now - prev.end.getTime() > 6 * DAY) return 0;
  const existing = await db.tournament.findUnique({ where: { id: prev.id } });
  if (existing?.status === "FINISHED") return 0;
  const s = await tournamentSettings();
  const rows0 = s.enabled ? await leaderboard(prev.start, prev.end, existing ? prizesOf(existing) : s.prizes.map(BigInt), BigInt(s.minBet)) : [];
  if (!existing && !rows0.length) return 0;   // неделя до запуска платформы: пустой турнир в историю не пишем
  const t = existing ?? (await ensureTournament(prev)); const prizes = prizesOf(t);
  const rows = rows0.map((r, i) => ({ ...r, prize: prizes[i] ?? 0n }));
  let paid = 0;
  for (const r of rows) {
    if (r.prize <= 0n || (await db.promoWin.findUnique({ where: { week_place: { week: prev.id, place: r.place } } }))) continue;
    await withUserTx(r.userId, async (tx) => {
      const { duplicate } = await applyEntry(tx, { userId: r.userId, type: "PROMO", amount: r.prize, idempotencyKey: `tour:${prev.id}:${r.place}`, note: `${t.title}: ${r.place} место` });
      if (!duplicate) await tx.promoWin.create({ data: { userId: r.userId, kind: "tournament", amount: r.prize, week: prev.id, place: r.place } });
    });
    paid++;
  }
  // Фиксируем итоговую таблицу; только тот, кто перевёл статус ACTIVE → FINISHED, рассылает уведомления
  const done = await db.$transaction(async (tx) => {
    const upd = await tx.tournament.updateMany({ where: { id: prev.id, status: "ACTIVE" }, data: { status: "FINISHED", finishedAt: new Date() } });
    if (!upd.count) return false;
    await tx.tournamentEntry.createMany({ data: rows.map((r) => ({ tournamentId: prev.id, place: r.place, userId: r.userId, score: r.mult, game: r.game, prize: r.prize })), skipDuplicates: true });
    return true;
  });
  if (done) for (const r of rows) {
    await notify(r.userId, { kind: "tournament_end", title: `${t.title} завершён`, body: `Твоё место: ${r.place}. Лучший множитель ${r.mult.toFixed(2)}×${r.prize > 0n ? `, приз ${points(r.prize)} зачислен` : ""}.`, link: `/leaderboard/${prev.id}` }).catch(() => {});
  }
  return paid;
}

/** Уведомление о старте турнира недели — игрокам, которые заходили за последние 14 дней. Один раз за неделю. */
export async function announceTournament(now = Date.now()) {
  const s = await tournamentSettings(); if (!s.enabled) return 0;
  const w = weekBounds(now); const t = await ensureTournament(w);
  const claim = await db.tournament.updateMany({ where: { id: w.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
  if (!claim.count) return 0;
  const since = new Date(now - 14 * DAY); const sinceDay = since.toISOString().slice(0, 10);
  const users = await db.activityDay.findMany({ where: { day: { gte: sinceDay }, user: { role: "USER", status: "ACTIVE", email: { not: { endsWith: `@${GUEST_DOMAIN}` } } } }, distinct: ["userId"], select: { userId: true } });
  await notifyMany(users.map((u) => u.userId), { kind: "tournament_start", title: `${t.title} начался`, body: `Лучший множитель за неделю со ставкой от ${points(BigInt(s.minBet))} попадает в таблицу. Призы — демо-кредиты.`, link: "/leaderboard" });
  return users.length;
}

/** История завершённых турниров (с тройкой лидеров). */
export async function tournamentHistory(take = 12) {
  const list = await db.tournament.findMany({ where: { status: "FINISHED" }, orderBy: { startsAt: "desc" }, take, include: { entries: { orderBy: { place: "asc" }, take: 3, include: { user: { select: { publicId: true, ...PUBLIC_USER_SELECT } } } }, _count: { select: { entries: true } } } });
  return list.map((t) => ({ id: t.id, title: t.title, startsAt: t.startsAt, endsAt: t.endsAt, finishedAt: t.finishedAt, participants: t._count.entries, top: t.entries.map(entryView) }));
}
function entryView(e: { place: number; score: Prisma.Decimal; game: string; prize: bigint; user: { publicId: string; username: string; avatar: string; role: string; hidden: boolean } }) {
  const pub = publicUser(e.user);
  return { place: e.place, ...pub, publicId: pub.user === HIDDEN_NAME ? null : e.user.publicId, mult: Number(e.score), game: e.game, prize: e.prize };
}
/** Полная таблица турнира (завершённого — из истории, текущего — живая). */
export async function tournamentDetails(id: string) {
  const t = await db.tournament.findUnique({ where: { id }, include: { entries: { orderBy: { place: "asc" }, include: { user: { select: { publicId: true, ...PUBLIC_USER_SELECT } } } } } });
  if (!t) throw new HttpError(404, "Турнир не найден", "not_found");
  if (t.status !== "FINISHED") {
    const cur = await currentTournament();
    if (cur.week !== t.id) throw new HttpError(404, "Итоги турнира ещё не подведены", "not_found");
    return { id: t.id, title: t.title, status: t.status, startsAt: t.startsAt, endsAt: t.endsAt, prizes: prizesOf(t), rows: cur.top.map(({ userId: _u, ...r }) => r) };
  }
  return { id: t.id, title: t.title, status: t.status, startsAt: t.startsAt, endsAt: t.endsAt, prizes: prizesOf(t), rows: t.entries.map(entryView) };
}

// ---------- Сводка для страницы «Бонусы» ----------
export async function promoSummary(userId?: string) {
  const [pool, tour, wins, st] = await Promise.all([
    jackpotPool(), currentTournament(),
    db.promoWin.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: { id: true, kind: true, amount: true, place: true, createdAt: true, user: { select: PUBLIC_USER_SELECT } } }),
    userId ? db.promoState.findUnique({ where: { userId } }) : null,
  ]);
  const meRow = userId ? tour.top.find((r) => r.userId === userId) : undefined;
  let best: number | null = null;
  if (userId && !meRow) {
    const r = await db.round.aggregate({ where: { userId, status: "WON", betAmount: { gte: tour.minBet }, settledAt: { gte: tour.startsAt, lt: tour.endsAt } }, _max: { multiplier: true } });
    best = r._max.multiplier ? Number(r._max.multiplier) : null;
  }
  return {
    keys: { have: st?.keys ?? 0, need: KEYS_NEEDED, perWager: KEY_PER_WAGER, minBet: KEY_MIN_BET, opened: st?.opened ?? 0 },
    jackpot: { pool, base: JACKPOT_BASE },
    chest: CHEST_PRIZES.map((p) => ({ amount: p.amount === "grand" ? "grand" : p.amount, chance: p.weight / WEIGHT })),
    tournament: { ...tour, top: tour.top.slice(0, 10).map(({ userId: _u, ...r }) => r), me: userId ? { place: meRow?.place ?? null, best: meRow?.mult ?? best } : null },
    wins: wins.map((w) => ({ id: w.id, kind: w.kind, amount: w.amount, place: w.place, at: w.createdAt, ...publicUser(w.user) })),
  };
}

export async function myKeys(userId: string) {
  const st = await db.promoState.findUnique({ where: { userId } });
  return { keys: st?.keys ?? 0, need: KEYS_NEEDED };
}
