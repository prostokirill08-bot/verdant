import { createHash } from "node:crypto";
import type { AchievementDef, QuestDef } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../http";
import { applyEntry, withUserTx } from "../wallet/ledger";
import { getSetting } from "../settings";
import { notify } from "./notify";
import { achievementTotals, dailyTotals, type Daily, type Totals } from "./metrics";
import { mskDay, shiftDay } from "@/lib/week";
import { DAILY_QUEST_COUNT, isAchievementMetric, isQuestMetric } from "@/lib/progress";
import { points } from "@/lib/format";

const valueOf = (t: Totals, metric: string) => (isAchievementMetric(metric) ? t[metric] : 0);
const dailyOf = (d: Daily, metric: string) => (isQuestMetric(metric) ? d[metric] : 0);

// ---------- Достижения ----------

/** Список достижений с прогрессом игрока. */
export async function listAchievements(userId: string) {
  const [defs, mine, totals] = await Promise.all([
    db.achievementDef.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    db.userAchievement.findMany({ where: { userId } }),
    achievementTotals(userId),
  ]);
  const got = new Map(mine.map((m) => [m.code, m]));
  return {
    totals,
    items: defs.map((d) => ({
      code: d.code, title: d.title, description: d.description, icon: d.icon, metric: d.metric, target: d.target, reward: d.reward,
      progress: Math.min(valueOf(totals, d.metric), d.target), unlockedAt: got.get(d.code)?.unlockedAt ?? null,
    })),
  };
}

/** Выдать достижение (один раз): строка с составным ключом + запись журнала с уникальным ключом. */
async function award(userId: string, d: AchievementDef) {
  return withUserTx(userId, async (tx) => {
    const created = await tx.userAchievement.createMany({ data: [{ userId, code: d.code, reward: d.reward }], skipDuplicates: true });
    if (!created.count) return false;
    if (d.reward > 0n) await applyEntry(tx, { userId, type: "REWARD", amount: d.reward, idempotencyKey: `ach:${userId}:${d.code}`, note: `Достижение «${d.title}»` });
    await notify(userId, { kind: "achievement", title: `Достижение: ${d.title}`, body: d.reward > 0n ? `${d.description}. Награда ${points(d.reward)} зачислена.` : d.description, link: "/account/achievements" }, tx);
    return true;
  });
}

// ---------- Ежедневные задания ----------

/** Задания на сутки: закреплённые + чередующиеся (порядок зависит только от даты — у всех игроков одинаковый). */
export async function questsForDay(dayId: string): Promise<QuestDef[]> {
  const defs = await db.questDef.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  const count = Number((await getSetting<{ dailyCount?: number }>("quests"))?.dailyCount ?? DAILY_QUEST_COUNT);
  const pinned = defs.filter((d) => d.pinned);
  const rest = defs.filter((d) => !d.pinned)
    .map((d) => ({ d, h: createHash("sha256").update(`${dayId}:${d.code}`).digest("hex") }))
    .sort((a, b) => (a.h < b.h ? -1 : 1)).map((x) => x.d);
  return [...pinned, ...rest].slice(0, Math.max(count, pinned.length)).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Задания на сегодня с прогрессом. Невостребованные награды за вчера тоже показываются (их ещё можно забрать). */
export async function listQuests(userId: string) {
  const day = mskDay();
  const [quests, daily, rows] = await Promise.all([
    questsForDay(day.id), dailyTotals(userId, day.id),
    db.userQuest.findMany({ where: { userId, day: { in: [day.id, shiftDay(day.id, -1)] } }, include: { def: true } }),
  ]);
  const row = (d: string, c: string) => rows.find((r) => r.day === d && r.code === c);
  const items = quests.map((q) => {
    const r = row(day.id, q.code); const progress = Math.min(dailyOf(daily, q.metric), q.target);
    return { code: q.code, day: day.id, title: q.title, description: q.description, metric: q.metric, target: q.target, reward: q.reward, progress, completed: !!r || progress >= q.target, claimedAt: r?.claimedAt ?? null };
  });
  const leftovers = rows.filter((r) => r.day !== day.id && !r.claimedAt).map((r) => ({
    code: r.code, day: r.day, title: r.def.title, description: r.def.description, metric: r.def.metric, target: r.def.target, reward: r.reward, progress: r.def.target, completed: true, claimedAt: null,
  }));
  return { day: day.id, resetsAt: day.end, items: [...leftovers, ...items] };
}

/** Забрать награду за задание. Повторный запрос не начислит второй раз (claimedAt + уникальный ключ журнала). */
export async function claimQuest(userId: string, code: string, dayId: string) {
  const today = mskDay().id;
  if (dayId !== today && dayId !== shiftDay(today, -1)) throw new HttpError(400, "Срок задания истёк", "quest_expired");
  const def = await db.questDef.findUnique({ where: { code } });
  if (!def) throw new HttpError(404, "Задание не найдено", "not_found");
  if (dayId === today) {
    // Задание должно быть в сегодняшнем списке и выполнено — проверяем по данным сервера
    if (!(await questsForDay(today)).some((q) => q.code === code)) throw new HttpError(400, "Это задание сегодня не выдавалось", "quest_inactive");
    const d = await dailyTotals(userId, today);
    if (dailyOf(d, def.metric) < def.target) throw new HttpError(400, "Задание ещё не выполнено", "quest_incomplete");
  }
  return withUserTx(userId, async (tx) => {
    let row = await tx.userQuest.findUnique({ where: { userId_day_code: { userId, day: dayId, code } } });
    if (!row) {
      if (dayId !== today) throw new HttpError(400, "Задание не было выполнено", "quest_incomplete");
      row = await tx.userQuest.create({ data: { userId, day: dayId, code, reward: def.reward } });
    }
    if (row.claimedAt) throw new HttpError(409, "Награда уже получена", "already_claimed");
    const upd = await tx.userQuest.updateMany({ where: { userId, day: dayId, code, claimedAt: null }, data: { claimedAt: new Date() } });
    if (!upd.count) throw new HttpError(409, "Награда уже получена", "already_claimed");
    const amount = row.reward;
    const r = amount > 0n ? await applyEntry(tx, { userId, type: "REWARD", amount, idempotencyKey: `quest:${userId}:${dayId}:${code}`, note: `Задание «${def.title}»` }) : null;
    const balance = r ? r.entry.balanceAfter : (await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance;
    return { reward: amount, balance };
  });
}

// ---------- Проверка игрока ----------

/**
 * Проверить достижения и задания игрока: выдать новые достижения, отметить выполненные задания.
 * Вызывается фоновой очередью после ставок и при открытии страниц прогресса. Безопасно вызывать сколько угодно раз.
 */
export async function evaluate(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user || user.status === "BLOCKED") return { achievements: 0, quests: 0 };
  let achievements = 0, quests = 0;

  const [defs, mine] = await Promise.all([db.achievementDef.findMany({ where: { enabled: true } }), db.userAchievement.findMany({ where: { userId }, select: { code: true } })]);
  const have = new Set(mine.map((m) => m.code));
  const open = defs.filter((d) => !have.has(d.code));
  if (open.length) {
    const totals = await achievementTotals(userId);
    for (const d of open) if (valueOf(totals, d.metric) >= d.target && (await award(userId, d))) achievements++;
  }

  const day = mskDay().id;
  const todays = await questsForDay(day);
  const done = new Set((await db.userQuest.findMany({ where: { userId, day }, select: { code: true } })).map((r) => r.code));
  const pending = todays.filter((q) => !done.has(q.code));
  if (pending.length) {
    const daily = await dailyTotals(userId, day);
    for (const q of pending) {
      if (dailyOf(daily, q.metric) < q.target) continue;
      const c = await db.userQuest.createMany({ data: [{ userId, day, code: q.code, reward: q.reward }], skipDuplicates: true });
      if (c.count) { quests++; await notify(userId, { kind: "quest", title: `Задание выполнено: ${q.title}`, body: q.reward > 0n ? `Забери награду ${points(q.reward)} в разделе «Задания».` : "Задание выполнено.", link: "/account/quests" }); }
    }
  }
  return { achievements, quests };
}
