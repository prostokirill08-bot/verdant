import { db } from "../db";
import { achievementTotals, activityStats } from "./metrics";
import { isGameSlug } from "@/lib/games";

/** Любимая игра — та, в которой больше всего завершённых раундов. */
export async function favoriteGame(userId: string) {
  const top = await db.round.groupBy({ by: ["gameSlug"], where: { userId, status: { in: ["WON", "LOST"] } }, _count: true, orderBy: { _count: { gameSlug: "desc" } }, take: 1 });
  return top[0] ? { slug: top[0].gameSlug, rounds: top[0]._count } : null;
}

/** Статистика профиля: всё считается по журналу раундов на сервере. */
export async function profileStats(userId: string) {
  const [agg, wins, totals, fav, act, achievements] = await Promise.all([
    db.round.aggregate({ where: { userId, status: { in: ["WON", "LOST"] } }, _count: true, _sum: { betAmount: true, payout: true }, _max: { multiplier: true } }),
    db.round.count({ where: { userId, status: "WON" } }),
    achievementTotals(userId), favoriteGame(userId), activityStats(userId),
    db.userAchievement.count({ where: { userId } }),
  ]);
  const games = await db.round.findMany({ where: { userId, status: { in: ["WON", "LOST"] } }, distinct: ["gameSlug"], select: { gameSlug: true } });
  return {
    rounds: agg._count, wins, winRate: agg._count ? wins / agg._count : 0,
    wagered: agg._sum.betAmount ?? 0n, returned: agg._sum.payout ?? 0n, best: agg._max.multiplier ? Number(agg._max.multiplier) : 0,
    gamesPlayed: games.length, favorite: fav, activeDays: act.total, streak: act.streak, achievements,
    countedRounds: totals.rounds_total,
  };
}

/** Последние игры игрока (без повторов), для «Недавно играли» и «Продолжить игру». */
export async function recentGames(userId: string, take = 8) {
  const rows = await db.round.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, distinct: ["gameSlug"], take, select: { gameSlug: true, createdAt: true } });
  return rows.filter((r) => isGameSlug(r.gameSlug)).map((r) => ({ slug: r.gameSlug, at: r.createdAt }));
}

/**
 * Игровые сессии: раунды подряд с перерывами не больше 30 минут объединяются в одну сессию.
 * Считается по последним 3 000 раундов за 60 дней.
 */
export async function gameSessions(userId: string, take = 20) {
  const GAP = 30 * 60 * 1000;
  const rounds = await db.round.findMany({
    where: { userId, status: { in: ["WON", "LOST"] }, createdAt: { gte: new Date(Date.now() - 60 * 24 * 3600 * 1000) } },
    orderBy: { createdAt: "desc" }, take: 3000, select: { gameSlug: true, betAmount: true, payout: true, createdAt: true, status: true },
  });
  type S = { start: Date; end: Date; rounds: number; wins: number; wagered: bigint; returned: bigint; games: Map<string, number> };
  const out: S[] = [];
  for (const r of rounds) {
    const cur = out[out.length - 1];
    if (cur && cur.start.getTime() - r.createdAt.getTime() <= GAP) {
      cur.start = r.createdAt; cur.rounds++; cur.wagered += r.betAmount; cur.returned += r.payout; if (r.status === "WON") cur.wins++;
      cur.games.set(r.gameSlug, (cur.games.get(r.gameSlug) ?? 0) + 1);
    } else {
      if (out.length >= take) break;
      out.push({ start: r.createdAt, end: r.createdAt, rounds: 1, wins: r.status === "WON" ? 1 : 0, wagered: r.betAmount, returned: r.payout, games: new Map([[r.gameSlug, 1]]) });
    }
  }
  return out.map((s) => ({
    start: s.start, end: s.end, minutes: Math.max(1, Math.round((s.end.getTime() - s.start.getTime()) / 60000)), rounds: s.rounds, wins: s.wins,
    wagered: s.wagered, net: s.returned - s.wagered, games: [...s.games.entries()].sort((a, b) => b[1] - a[1]).map(([slug, n]) => ({ slug, rounds: n })),
  }));
}
