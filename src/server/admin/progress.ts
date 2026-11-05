import { z } from "zod";
import type { LedgerType, Prisma } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../http";
import type { SessionUser } from "../auth/session";
import { audit } from "../security/audit";
import { ACH_ICON_KEYS, isAchievementMetric, isQuestMetric } from "@/lib/progress";
import { getSetting, putSetting } from "../settings";
import { mskDay } from "@/lib/week";
import { questsForDay } from "../progress/engine";
import { amountSchema } from "../games/instant";

const code = z.string().regex(/^[a-z0-9_]{2,40}$/, "Код: латиница, цифры и _ (2–40 символов)");
const base = {
  title: z.string().trim().min(2).max(60), description: z.string().trim().min(2).max(200),
  target: z.number().int().min(1).max(1_000_000), reward: amountSchema,
  enabled: z.boolean(), sortOrder: z.number().int().min(0).max(1000),
};
export const achievementInput = z.object({ code, ...base, icon: z.string().refine((i) => ACH_ICON_KEYS.includes(i), "Неизвестная иконка"), metric: z.string().refine(isAchievementMetric, "Неизвестная метрика") });
export const questInput = z.object({ code, ...base, pinned: z.boolean(), metric: z.string().refine(isQuestMetric, "Неизвестная метрика") });
const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

// ---------- Достижения ----------
export async function listAchievementDefs() {
  const [defs, counts] = await Promise.all([
    db.achievementDef.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    db.userAchievement.groupBy({ by: ["code"], _count: true }),
  ]);
  return { items: defs.map((d) => ({ ...d, unlocked: counts.find((c) => c.code === d.code)?._count ?? 0 })) };
}
export async function upsertAchievement(actor: SessionUser, p: z.infer<typeof achievementInput>, ip: string, create: boolean) {
  const exists = await db.achievementDef.findUnique({ where: { code: p.code } });
  if (create && exists) throw new HttpError(409, "Достижение с таким кодом уже есть", "exists");
  if (!create && !exists) throw new HttpError(404, "Достижение не найдено", "not_found");
  const { code: c, ...data } = p;
  const row = await db.achievementDef.upsert({ where: { code: c }, create: { code: c, ...data }, update: data });
  await audit(create ? "admin.achievement.create" : "admin.achievement.update", { actorId: actor.id, targetType: "achievement", targetId: c, ip, meta: json(data) });
  return row;
}
export async function deleteAchievement(actor: SessionUser, c: string, ip: string) {
  // Выданные достижения удаляются каскадом; начисленные награды остаются в журнале (журнал неизменяем)
  const r = await db.achievementDef.deleteMany({ where: { code: c } });
  if (!r.count) throw new HttpError(404, "Достижение не найдено", "not_found");
  await audit("admin.achievement.delete", { actorId: actor.id, targetType: "achievement", targetId: c, ip });
}

// ---------- Ежедневные задания ----------
export const questSettingsInput = z.object({ dailyCount: z.number().int().min(1).max(10) });
export async function listQuestDefs() {
  const day = mskDay().id;
  const [defs, done, claimed, today, settings] = await Promise.all([
    db.questDef.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    db.userQuest.groupBy({ by: ["code"], where: { day }, _count: true }),
    db.userQuest.groupBy({ by: ["code"], where: { day, claimedAt: { not: null } }, _count: true }),
    questsForDay(day), getSetting<{ dailyCount?: number }>("quests"),
  ]);
  return {
    day, dailyCount: settings?.dailyCount ?? 4, today: today.map((q) => q.code),
    items: defs.map((d) => ({ ...d, completedToday: done.find((x) => x.code === d.code)?._count ?? 0, claimedToday: claimed.find((x) => x.code === d.code)?._count ?? 0 })),
  };
}
export async function upsertQuest(actor: SessionUser, p: z.infer<typeof questInput>, ip: string, create: boolean) {
  const exists = await db.questDef.findUnique({ where: { code: p.code } });
  if (create && exists) throw new HttpError(409, "Задание с таким кодом уже есть", "exists");
  if (!create && !exists) throw new HttpError(404, "Задание не найдено", "not_found");
  const { code: c, ...data } = p;
  const row = await db.questDef.upsert({ where: { code: c }, create: { code: c, ...data }, update: data });
  await audit(create ? "admin.quest.create" : "admin.quest.update", { actorId: actor.id, targetType: "quest", targetId: c, ip, meta: json(data) });
  return row;
}
export async function deleteQuest(actor: SessionUser, c: string, ip: string) {
  const r = await db.questDef.deleteMany({ where: { code: c } });
  if (!r.count) throw new HttpError(404, "Задание не найдено", "not_found");
  await audit("admin.quest.delete", { actorId: actor.id, targetType: "quest", targetId: c, ip });
}
export async function setQuestSettings(actor: SessionUser, p: z.infer<typeof questSettingsInput>, ip: string) {
  await putSetting("quests", p);
  await audit("admin.quest.settings", { actorId: actor.id, ip, meta: p });
  return p;
}

// ---------- Журнал операций всех игроков ----------
export const ledgerQuery = z.object({
  type: z.enum(["ALL", "DEPOSIT", "DEMO_GRANT", "PROMO", "BET", "WIN", "REFUND", "ADMIN_ADJUST", "REWARD"]).default("ALL"),
  q: z.string().trim().max(60).optional(), cursor: z.string().max(40).optional(),
});
export async function listLedger(p: z.infer<typeof ledgerQuery>) {
  const where: Prisma.LedgerEntryWhereInput = {
    ...(p.type !== "ALL" ? { type: p.type as LedgerType } : {}),
    ...(p.q ? { user: { OR: [{ username: { contains: p.q, mode: "insensitive" } }, { publicId: { contains: p.q.toUpperCase() } }] } } : {}),
  };
  const rows = await db.ledgerEntry.findMany({
    where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
    select: { id: true, type: true, amount: true, balanceAfter: true, note: true, roundId: true, createdAt: true, user: { select: { id: true, username: true, publicId: true } } },
  });
  return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null };
}

// ---------- Ошибки ----------
export async function listErrors(source?: string, cursor?: string) {
  const rows = await db.errorLog.findMany({
    where: source && ["api", "job", "client"].includes(source) ? { source } : {}, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51,
    ...(cursor && /^[a-z0-9]{10,40}$/.test(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const [day, total] = await Promise.all([db.errorLog.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } }), db.errorLog.count()]);
  return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49]!.id : null, last24h: day, total };
}
export async function clearErrors(actor: SessionUser, ip: string) {
  const r = await db.errorLog.deleteMany({});
  await audit("admin.errors.clear", { actorId: actor.id, ip, meta: { removed: r.count } });
  return r.count;
}
