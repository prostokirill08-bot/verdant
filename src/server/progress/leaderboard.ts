import { Prisma } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../http";
import { HIDDEN_NAME, publicUser, PUBLIC_USER_SELECT } from "../security/privacy";
import { GUEST_DOMAIN } from "@/lib/guest";
import { weekBounds } from "@/lib/week";
import { PROGRESS_MIN_BET } from "@/lib/progress";
import { favoriteGame } from "./profile";
import { activityStats } from "./metrics";

export const BOARDS = {
  week_activity: "Активность недели",
  rounds: "Больше всего раундов",
  wins: "Больше всего побед",
  best: "Лучший множитель",
  achievements: "Достижения",
} as const;
export type Board = keyof typeof BOARDS;
export const isBoard = (b: unknown): b is Board => typeof b === "string" && b in BOARDS;

type Raw = { userId: string; score: number };
const cache = globalThis as unknown as { __vdBoards?: Map<string, { at: number; rows: unknown[] }> };

/**
 * Общие рейтинги по реальным данным (раунды со ставкой от 1 кредита). Гости, сотрудники и заблокированные не участвуют;
 * игроки в анонимном режиме видны как «Скрытый игрок» без ссылки на профиль. Кэш — 60 секунд.
 */
export async function leaderboard(board: Board, take = 50) {
  const key = `${board}:${take}`; const map = (cache.__vdBoards ??= new Map());
  const hit = map.get(key); if (hit && Date.now() - hit.at < 60_000) return hit.rows;
  const eligible = Prisma.sql`u.role = 'USER' AND u.status = 'ACTIVE' AND u.email NOT LIKE ${"%@" + GUEST_DOMAIN}`;
  let raw: Raw[];
  if (board === "achievements") {
    raw = await db.$queryRaw<Raw[]>`SELECT a."userId", count(*)::int AS score FROM "UserAchievement" a JOIN "User" u ON u.id = a."userId" WHERE ${eligible} GROUP BY a."userId" ORDER BY score DESC, min(a."unlockedAt") ASC LIMIT ${take}`;
  } else {
    const since = board === "week_activity" ? Prisma.sql`AND r."settledAt" >= ${weekBounds().start}` : Prisma.empty;
    const status = board === "wins" || board === "best" ? Prisma.sql`r.status = 'WON'` : Prisma.sql`r.status IN ('WON', 'LOST')`;
    const agg = board === "best" ? Prisma.sql`max(r.multiplier)::float8` : Prisma.sql`count(*)::int`;
    raw = await db.$queryRaw<Raw[]>`SELECT r."userId", ${agg} AS score FROM "Round" r JOIN "User" u ON u.id = r."userId"
      WHERE ${status} AND r."betAmount" >= ${PROGRESS_MIN_BET} AND ${eligible} ${since} GROUP BY r."userId" ORDER BY score DESC, min(r."settledAt") ASC LIMIT ${take}`;
  }
  const users = await db.user.findMany({ where: { id: { in: raw.map((r) => r.userId) } }, select: { id: true, publicId: true, ...PUBLIC_USER_SELECT } });
  const rows = raw.map((r, i) => {
    const u = users.find((x) => x.id === r.userId)!; const pub = publicUser(u);
    return { place: i + 1, ...pub, publicId: pub.user === HIDDEN_NAME ? null : u.publicId, score: Number(r.score), uid: r.userId };
  });
  map.set(key, { at: Date.now(), rows });
  return rows;
}

/** Публичный профиль участника. Анонимные игроки, гости и сотрудники профиля не имеют. */
export async function publicProfile(publicId: string) {
  const u = await db.user.findUnique({ where: { publicId }, select: { id: true, publicId: true, createdAt: true, status: true, email: true, ...PUBLIC_USER_SELECT } });
  if (!u || u.status !== "ACTIVE" || u.hidden || u.role !== "USER" || u.email.endsWith(`@${GUEST_DOMAIN}`)) throw new HttpError(404, "Профиль скрыт или не найден", "not_found");
  const [agg, wins, fav, act, achievements, places] = await Promise.all([
    db.round.aggregate({ where: { userId: u.id, status: { in: ["WON", "LOST"] } }, _count: true, _max: { multiplier: true } }),
    db.round.count({ where: { userId: u.id, status: "WON" } }),
    favoriteGame(u.id), activityStats(u.id),
    db.userAchievement.findMany({ where: { userId: u.id }, orderBy: { unlockedAt: "desc" }, include: { def: { select: { title: true, icon: true, description: true } } } }),
    db.tournamentEntry.findMany({ where: { userId: u.id }, orderBy: { tournament: { startsAt: "desc" } }, take: 10, include: { tournament: { select: { title: true, id: true } } } }),
  ]);
  return {
    publicId: u.publicId, user: u.username, avatar: u.avatar, since: u.createdAt,
    stats: { rounds: agg._count, wins, best: agg._max.multiplier ? Number(agg._max.multiplier) : 0, activeDays: act.total, favorite: fav?.slug ?? null },
    achievements: achievements.map((a) => ({ code: a.code, title: a.def.title, icon: a.def.icon, description: a.def.description, at: a.unlockedAt })),
    tournaments: places.map((p) => ({ id: p.tournament.id, title: p.tournament.title, place: p.place, mult: Number(p.score), prize: p.prize })),
  };
}
