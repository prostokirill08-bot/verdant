import { Prisma } from "@prisma/client";
import { db } from "../db";
import { gameCategories } from "../catalog";
import { mskDay, mskDayBounds, shiftDay } from "@/lib/week";
import { PROGRESS_MIN_BET, type AchievementMetric, type QuestMetric } from "@/lib/progress";

type Agg = { rounds: bigint; wins: bigint; wagered: bigint | null; best: Prisma.Decimal | null; games: string[] | null };

/** Сводка по засчитанным раундам игрока (ставка ≥ 1 кредита), при необходимости — в интервале по времени расчёта. */
async function roundAgg(userId: string, from?: Date, to?: Date): Promise<Agg> {
  const time = from && to ? Prisma.sql`AND "settledAt" >= ${from} AND "settledAt" < ${to}` : Prisma.empty;
  const [row] = await db.$queryRaw<Agg[]>`
    SELECT count(*)::bigint AS rounds,
           count(*) FILTER (WHERE status = 'WON')::bigint AS wins,
           sum("betAmount")::bigint AS wagered,
           max(multiplier) FILTER (WHERE status = 'WON') AS best,
           array_agg(DISTINCT "gameSlug") AS games
    FROM "Round"
    WHERE "userId" = ${userId} AND status IN ('WON', 'LOST') AND "betAmount" >= ${PROGRESS_MIN_BET} ${time}`;
  return row ?? { rounds: 0n, wins: 0n, wagered: 0n, best: null, games: [] };
}

/** Дни активности (по убыванию) и серия подряд, заканчивающаяся сегодня или вчера. */
export async function activityStats(userId: string) {
  const days = (await db.activityDay.findMany({ where: { userId }, select: { day: true }, orderBy: { day: "desc" } })).map((d) => d.day);
  const today = mskDay().id;
  let streak = 0;
  if (days.length && (days[0] === today || days[0] === shiftDay(today, -1))) {
    streak = 1;
    for (let i = 1; i < days.length && days[i] === shiftDay(days[i - 1]!, -1); i++) streak++;
  }
  return { total: days.length, streak, days };
}

export type Totals = Record<AchievementMetric, number>;
/** Все метрики достижений игрока. */
export async function achievementTotals(userId: string): Promise<Totals> {
  const [a, act] = await Promise.all([roundAgg(userId), activityStats(userId)]);
  return {
    rounds_total: Number(a.rounds), wins_total: Number(a.wins), games_distinct: (a.games ?? []).filter(Boolean).length,
    active_days: act.total, streak_days: act.streak, best_multiplier: a.best ? Number(a.best) : 0,
    wagered_total: Math.floor(Number(a.wagered ?? 0n) / 100),
  };
}

export type Daily = Record<QuestMetric, number>;
/** Метрики заданий за сутки (по Москве). */
export async function dailyTotals(userId: string, dayId = mskDay().id): Promise<Daily> {
  const b = mskDayBounds(dayId);
  const [a, visit, cats] = await Promise.all([
    roundAgg(userId, b.start, b.end),
    db.activityDay.findUnique({ where: { userId_day: { userId, day: dayId } } }),
    gameCategories(),
  ]);
  const games = (a.games ?? []).filter(Boolean);
  let fresh = 0;
  if (games.length) {
    const before = await db.round.findMany({ where: { userId, gameSlug: { in: games }, status: { in: ["WON", "LOST"] }, betAmount: { gte: PROGRESS_MIN_BET }, settledAt: { lt: b.start } }, distinct: ["gameSlug"], select: { gameSlug: true } });
    fresh = games.length - before.length;
  }
  return {
    visit_today: visit ? 1 : 0, rounds_today: Number(a.rounds), wins_today: Number(a.wins), games_today: games.length,
    categories_today: new Set(games.map((g) => cats.get(g) ?? g)).size, new_game_today: fresh,
    wagered_today: Math.floor(Number(a.wagered ?? 0n) / 100),
  };
}
