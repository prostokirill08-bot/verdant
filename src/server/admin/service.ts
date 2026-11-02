import { z } from "zod";
import type { Prisma, Role, UserStatus } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../http";
import type { SessionUser } from "../auth/session";
import { audit } from "../security/audit";
import { applyEntry, verifyWallet, withUserTx } from "../wallet/ledger";
import { getPlatform, platformSchema, setPlatform } from "../settings";
import { amountSchema } from "../games/instant";
import { requestKey } from "../games/play";

const DAY = 86_400_000;

// ---------- Обзор ----------
export async function adminStats() {
  const since = new Date(Date.now() - DAY);
  const [users, newUsers, blocked, sessions, rounds24, all, day, perGame, wallets, ledger, series] = await Promise.all([
    db.user.count(), db.user.count({ where: { createdAt: { gte: since } } }), db.user.count({ where: { status: "BLOCKED" } }),
    db.session.count({ where: { expiresAt: { gt: new Date() } } }),
    db.round.count({ where: { createdAt: { gte: since } } }),
    db.round.aggregate({ where: { status: { in: ["WON", "LOST"] } }, _sum: { betAmount: true, payout: true }, _count: true }),
    db.round.aggregate({ where: { status: { in: ["WON", "LOST"] }, createdAt: { gte: since } }, _sum: { betAmount: true, payout: true } }),
    db.round.groupBy({ by: ["gameSlug"], where: { status: { in: ["WON", "LOST"] } }, _sum: { betAmount: true, payout: true }, _count: true }),
    db.wallet.aggregate({ _sum: { balance: true } }),
    db.ledgerEntry.aggregate({ _sum: { amount: true } }),
    db.$queryRaw<{ day: Date; rounds: bigint; wagered: bigint | null; payout: bigint | null }[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS rounds,
             sum("betAmount")::bigint AS wagered, sum("payout")::bigint AS payout
      FROM "Round" WHERE "createdAt" > now() - interval '14 days' AND status IN ('WON','LOST')
      GROUP BY 1 ORDER BY 1`,
  ]);
  const walletSum = wallets._sum.balance ?? 0n, ledgerSum = ledger._sum.amount ?? 0n;
  return {
    users: { total: users, new24h: newUsers, blocked }, sessions,
    rounds: { total: all._count, last24h: rounds24 },
    wagered: { total: all._sum.betAmount ?? 0n, last24h: day._sum.betAmount ?? 0n },
    payout: { total: all._sum.payout ?? 0n, last24h: day._sum.payout ?? 0n },
    integrity: { walletSum, ledgerSum, ok: walletSum === ledgerSum },
    games: perGame.map((g) => ({ slug: g.gameSlug, rounds: g._count, wagered: g._sum.betAmount ?? 0n, payout: g._sum.payout ?? 0n })),
    series: series.map((s) => ({ day: s.day.toISOString().slice(0, 10), rounds: Number(s.rounds), wagered: s.wagered ?? 0n, payout: s.payout ?? 0n })),
  };
}

// ---------- Пользователи ----------
export const usersQuery = z.object({
  q: z.string().trim().max(100).optional(), status: z.enum(["ACTIVE", "BLOCKED"]).optional(), role: z.enum(["USER", "SUPPORT", "ADMIN"]).optional(),
  cursor: z.string().max(40).optional(),
});
export async function listUsers(p: z.infer<typeof usersQuery>) {
  const where: Prisma.UserWhereInput = {
    ...(p.status ? { status: p.status } : {}), ...(p.role ? { role: p.role } : {}),
    ...(p.q ? { OR: [{ email: { contains: p.q, mode: "insensitive" } }, { username: { contains: p.q, mode: "insensitive" } }, { publicId: { contains: p.q.toUpperCase() } }] } : {}),
  };
  const rows = await db.user.findMany({
    where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 26, ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
    select: { id: true, publicId: true, email: true, username: true, role: true, status: true, avatar: true, createdAt: true, lastLoginAt: true, wallet: { select: { balance: true } } },
  });
  return { users: rows.slice(0, 25).map(({ wallet, ...u }) => ({ ...u, balance: wallet?.balance ?? 0n })), nextCursor: rows.length > 25 ? rows[24]!.id : null };
}

export async function userDetail(id: string) {
  const u = await db.user.findUnique({
    where: { id },
    select: { id: true, publicId: true, email: true, username: true, role: true, status: true, avatar: true, createdAt: true, lastLoginAt: true, failedLogins: true, lockedUntil: true },
  });
  if (!u) throw new HttpError(404, "Пользователь не найден", "not_found");
  const [check, stats, ledger, sessions, rounds, events] = await Promise.all([
    verifyWallet(id),
    db.round.aggregate({ where: { userId: id, status: { in: ["WON", "LOST"] } }, _count: true, _sum: { betAmount: true, payout: true } }),
    db.ledgerEntry.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.session.findMany({ where: { userId: id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true } }),
    db.round.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, gameSlug: true, status: true, betAmount: true, payout: true, multiplier: true, createdAt: true } }),
    db.auditLog.findMany({ where: { OR: [{ actorId: id }, { targetId: id }] }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return {
    user: u, wallet: check,
    stats: { rounds: stats._count, wagered: stats._sum.betAmount ?? 0n, payout: stats._sum.payout ?? 0n },
    ledger, rounds: rounds.map((r) => ({ ...r, multiplier: Number(r.multiplier) })),
    sessions: sessions.map((s) => ({ ...s, id: s.id.slice(0, 12) })), events,
  };
}

const RANK: Record<Role, number> = { USER: 0, SUPPORT: 1, ADMIN: 2 };
async function target(actor: SessionUser, id: string) {
  if (actor.id === id) throw new HttpError(400, "Нельзя менять собственный аккаунт через админ-панель", "self");
  const t = await db.user.findUnique({ where: { id } });
  if (!t) throw new HttpError(404, "Пользователь не найден", "not_found");
  if (RANK[t.role] >= RANK[actor.role]) throw new HttpError(403, "Нельзя менять пользователя с такой же или более высокой ролью", "forbidden");
  return t;
}

export const statusInput = z.object({ status: z.enum(["ACTIVE", "BLOCKED"]), reason: z.string().trim().min(3, "Укажи причину").max(200) });
export async function setUserStatus(actor: SessionUser, id: string, status: UserStatus, reason: string, ip: string) {
  await target(actor, id);
  await db.$transaction([
    db.user.update({ where: { id }, data: { status } }),
    ...(status === "BLOCKED" ? [db.session.deleteMany({ where: { userId: id } })] : []),
  ]);
  await audit(status === "BLOCKED" ? "admin.user.block" : "admin.user.unblock", { actorId: actor.id, targetType: "user", targetId: id, ip, meta: { reason } });
}

export const roleInput = z.object({ role: z.enum(["USER", "SUPPORT"]) });
export async function setUserRole(actor: SessionUser, id: string, role: Role, ip: string) {
  const t = await target(actor, id);
  await db.user.update({ where: { id }, data: { role } });
  await audit("admin.user.role", { actorId: actor.id, targetType: "user", targetId: id, ip, meta: { from: t.role, to: role } });
}

export const adjustInput = z.object({
  direction: z.enum(["credit", "debit"]), amount: amountSchema, reason: z.string().trim().min(3, "Укажи причину").max(200), key: requestKey,
}).refine((x) => x.amount > 0n && x.amount <= 100_000_000n, "Сумма от 0,01 до 1 000 000 баллов");
export async function adjustBalance(actor: SessionUser, id: string, p: z.infer<typeof adjustInput>, ip: string) {
  await target(actor, id);
  const amount = p.direction === "credit" ? p.amount : -p.amount;
  const res = await withUserTx(id, (tx) => applyEntry(tx, { userId: id, type: "ADMIN_ADJUST", amount, idempotencyKey: `adj:${actor.id}:${p.key}`, note: p.reason }));
  if (!res.duplicate) await audit("admin.wallet.adjust", { actorId: actor.id, targetType: "user", targetId: id, ip, meta: { amount: amount.toString(), reason: p.reason } });
  return { balance: res.entry.balanceAfter };
}

export async function revokeUserSessions(actor: SessionUser, id: string, ip: string) {
  await target(actor, id);
  const r = await db.session.deleteMany({ where: { userId: id } });
  await audit("admin.sessions.revoke", { actorId: actor.id, targetType: "user", targetId: id, ip, meta: { count: r.count } });
  return { count: r.count };
}

// ---------- Сессии ----------
export async function listSessions() {
  const rows = await db.session.findMany({
    where: { expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 100,
    include: { user: { select: { id: true, username: true, publicId: true, role: true, avatar: true } } },
  });
  // Хэш токена целиком не отдаём — только короткий идентификатор для отзыва
  return rows.map((s) => ({ ref: s.id.slice(0, 16), ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, expiresAt: s.expiresAt, user: s.user }));
}
export async function revokeSession(actor: SessionUser, ref: string, ip: string) {
  if (!/^[a-f0-9]{16}$/.test(ref)) throw new HttpError(400, "Неверная сессия", "bad_ref");
  const s = await db.session.findFirst({ where: { id: { startsWith: ref } }, include: { user: true } });
  if (!s) throw new HttpError(404, "Сессия не найдена", "not_found");
  if (s.userId !== actor.id) await target(actor, s.userId);
  await db.session.delete({ where: { id: s.id } });
  await audit("admin.session.revoke", { actorId: actor.id, targetType: "user", targetId: s.userId, ip });
}

// ---------- Игры ----------
export const gameInput = z.object({
  title: z.string().trim().min(2).max(40).optional(), tagline: z.string().trim().max(120).optional(), enabled: z.boolean().optional(),
  minBet: amountSchema.optional(), maxBet: amountSchema.optional(),
  houseEdgeBp: z.number().int().min(0, "Преимущество от 0 до 10%").max(1000, "Преимущество от 0 до 10%").optional(),
  sortOrder: z.number().int().min(0).max(100).optional(),
});
export async function listGamesAdmin() {
  const [games, stats] = await Promise.all([
    db.game.findMany({ orderBy: { sortOrder: "asc" } }),
    db.round.groupBy({ by: ["gameSlug"], where: { status: { in: ["WON", "LOST"] } }, _sum: { betAmount: true, payout: true }, _count: true }),
  ]);
  return games.map((g) => { const s = stats.find((x) => x.gameSlug === g.slug); return { ...g, rounds: s?._count ?? 0, wagered: s?._sum.betAmount ?? 0n, payout: s?._sum.payout ?? 0n }; });
}
export async function updateGame(actor: SessionUser, slug: string, p: z.infer<typeof gameInput>, ip: string) {
  const g = await db.game.findUnique({ where: { slug } });
  if (!g) throw new HttpError(404, "Игра не найдена", "not_found");
  const min = p.minBet ?? g.minBet, max = p.maxBet ?? g.maxBet;
  if (min < 1n) throw new HttpError(400, "Минимальная ставка от 0,01", "bad_limits");
  if (min >= max) throw new HttpError(400, "Минимальная ставка должна быть меньше максимальной", "bad_limits");
  const upd = await db.game.update({ where: { slug }, data: p });
  await audit("admin.game.update", { actorId: actor.id, targetType: "game", targetId: slug, ip, meta: JSON.parse(JSON.stringify(p, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) });
  return upd;
}

// ---------- Журнал ----------
export const auditQuery = z.object({ action: z.string().trim().max(60).optional(), actor: z.string().trim().max(40).optional(), cursor: z.string().max(40).optional() });
export async function listAudit(p: z.infer<typeof auditQuery>) {
  const rows = await db.auditLog.findMany({
    where: { ...(p.action ? { action: { startsWith: p.action } } : {}), ...(p.actor ? { OR: [{ actorId: p.actor }, { targetId: p.actor }] } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
  });
  const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.targetType === "user" ? r.targetId : null]).filter((x): x is string => !!x))];
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
  const name = new Map(users.map((u) => [u.id, u.username]));
  return {
    items: rows.slice(0, 50).map((r) => ({ ...r, actor: r.actorId ? name.get(r.actorId) ?? null : null, target: r.targetType === "user" && r.targetId ? name.get(r.targetId) ?? null : r.targetId })),
    nextCursor: rows.length > 50 ? rows[49]!.id : null,
  };
}

// ---------- Настройки ----------
export const settingsInput = platformSchema.partial();
export { getPlatform };
export async function updateSettings(actor: SessionUser, patch: z.infer<typeof settingsInput>, ip: string) {
  const before = await getPlatform();
  const next = await setPlatform(patch);
  await audit("admin.settings.update", { actorId: actor.id, ip, meta: { before, after: next } });
  return next;
}
