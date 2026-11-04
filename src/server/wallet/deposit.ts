import { db } from "../db";
import { HttpError } from "../http";
import { audit } from "../security/audit";
import { applyEntry, withUserTx } from "./ledger";

/**
 * Демо-касса. Пополнение начисляет демо-рубли через тот же журнал баланса, что и игры.
 * Реальные платежи не проводятся и данные карт не запрашиваются: модуль показывает, как устроен
 * кассовый сценарий (лимиты, идемпотентность, история, отчёт), без связи с деньгами.
 */
export const DEPOSIT_MIN = 300_00n;            // 300 ₽ за одно пополнение
export const DEPOSIT_MAX = 300_000_00n;        // 300 000 ₽ за одно пополнение
export const DEPOSIT_DAY_LIMIT = 1_000_000_00n; // не больше 1 000 000 ₽ за 24 часа
export const DEPOSIT_METHODS = ["card", "sbp", "wallet"] as const;
const DAY = 24 * 3600 * 1000;

export async function createDeposit(userId: string, amount: bigint, method: string, key: string, ip: string) {
  if (amount < DEPOSIT_MIN || amount > DEPOSIT_MAX) throw new HttpError(400, "Сумма пополнения — от 300 до 300 000 ₽", "deposit_range");
  const res = await withUserTx(userId, async (tx) => {
    const prev = await tx.deposit.findUnique({ where: { key: `${userId}:${key}` } });
    if (prev) {
      const w = await tx.wallet.findUnique({ where: { userId } });
      return { deposit: prev, balance: w!.balance, duplicate: true };
    }
    const day = await tx.deposit.aggregate({ where: { userId, createdAt: { gte: new Date(Date.now() - DAY) } }, _sum: { amount: true } });
    const left = DEPOSIT_DAY_LIMIT - (day._sum.amount ?? 0n);
    if (amount > left) throw new HttpError(400, left > 0n ? `Лимит на сутки — 1 000 000 ₽. Сейчас можно пополнить ещё на ${(Number(left) / 100).toLocaleString("ru-RU")} ₽` : "Суточный лимит пополнений исчерпан — 1 000 000 ₽ за 24 часа", "deposit_limit");
    const deposit = await tx.deposit.create({ data: { userId, amount, method, key: `${userId}:${key}` } });
    const { entry } = await applyEntry(tx, { userId, type: "DEPOSIT", amount, idempotencyKey: `dep:${deposit.id}`, note: "Пополнение через демо-кассу" });
    return { deposit, balance: entry.balanceAfter, duplicate: false };
  });
  if (!res.duplicate) await audit("wallet.deposit", { actorId: userId, ip, meta: { amount: amount.toString(), method } });
  return res;
}

export async function depositInfo(userId: string) {
  const [items, day] = await Promise.all([
    db.deposit.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, amount: true, method: true, createdAt: true } }),
    db.deposit.aggregate({ where: { userId, createdAt: { gte: new Date(Date.now() - DAY) } }, _sum: { amount: true } }),
  ]);
  return { min: DEPOSIT_MIN, max: DEPOSIT_MAX, dayLimit: DEPOSIT_DAY_LIMIT, dayUsed: day._sum.amount ?? 0n, items };
}

/** Отчёт для админки: суммы за сутки, неделю и всё время + последние пополнения. */
export async function depositReport() {
  const now = Date.now();
  const agg = (since?: number) => db.deposit.aggregate({ where: since ? { createdAt: { gte: new Date(since) } } : {}, _sum: { amount: true }, _count: true });
  const [d1, d7, all, payers, last] = await Promise.all([
    agg(now - DAY), agg(now - 7 * DAY), agg(),
    db.deposit.groupBy({ by: ["userId"] }).then((r) => r.length),
    db.deposit.findMany({ orderBy: { createdAt: "desc" }, take: 50, select: { id: true, amount: true, method: true, createdAt: true, user: { select: { id: true, username: true, publicId: true } } } }),
  ]);
  const row = (a: Awaited<ReturnType<typeof agg>>) => ({ sum: a._sum.amount ?? 0n, count: a._count });
  return { day: row(d1), week: row(d7), all: row(all), payers, items: last };
}
