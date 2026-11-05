import { Prisma, type LedgerType } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../http";
import { onBet } from "../promo/keys";
import { markDirty } from "../progress/queue";

type Tx = Prisma.TransactionClient;

/**
 * Единственная точка изменения баланса.
 * - сумма со знаком: списание < 0, начисление > 0;
 * - idempotencyKey уникален: повторный вызов с тем же ключом не меняет баланс (защита от двойного списания);
 * - списание атомарно проверяет, что баланса хватает (UPDATE … WHERE balance >= x).
 */
export async function applyEntry(tx: Tx, p: { userId: string; type: LedgerType; amount: bigint; idempotencyKey: string; roundId?: string; note?: string }) {
  const existing = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: p.idempotencyKey } });
  if (existing) return { entry: existing, duplicate: true };
  const wallet = await tx.wallet.findUnique({ where: { userId: p.userId } });
  if (!wallet) throw new HttpError(404, "Кошелёк не найден", "no_wallet");
  const updated = await tx.wallet.updateMany({
    where: { id: wallet.id, ...(p.amount < 0n ? { balance: { gte: -p.amount } } : {}) },
    data: { balance: { increment: p.amount }, version: { increment: 1 } },
  });
  if (updated.count === 0) throw new HttpError(400, "Недостаточно средств", "insufficient");
  const w = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  const entry = await tx.ledgerEntry.create({ data: { walletId: w.id, userId: p.userId, type: p.type, amount: p.amount, balanceAfter: w.balance, idempotencyKey: p.idempotencyKey, roundId: p.roundId, note: p.note } });
  // Акция «Снежные ключи»: шанс ключа и пополнение джекпота с каждой ставки
  if (p.type === "BET") await onBet(tx, p.userId, -p.amount);
  // Достижения и задания проверяются после фиксации транзакции фоновой очередью
  if (p.type === "BET" || p.type === "WIN") markDirty(p.userId);
  return { entry, duplicate: false };
}

/** Транзакция с уровнем изоляции Serializable и повтором при конфликте. */
/**
 * Serializable-транзакция с повтором при конфликте (P2034). retryUnique — повторять ли и при нарушении
 * уникальности (P2002): для регистрации это бессмысленно (почта/ник заняты), а конфликт параллельных
 * регистраций нужно повторять — иначе одновременный наплыв игроков получает ошибку 500.
 */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>, attempts = 3, retryUnique = true): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }); }
    catch (e) {
      const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : "";
      const retry = code === "P2034" || (retryUnique && code === "P2002");
      if (!retry || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 15 * i + Math.random() * 40));   // разводим повторы во времени
    }
  }
}

/**
 * Транзакция по одному игроку: первым делом блокирует строку его кошелька (SELECT … FOR UPDATE).
 * Все денежные и игровые операции игрока выполняются строго по очереди — без конфликтов и потерянных обновлений,
 * а параллельные запросы разных игроков друг другу не мешают.
 */
export async function withUserTx<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
        return fn(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000, maxWait: 10000 });
    } catch (e) {
      // P2002: гонка на уникальном ключе (тот же запрос пришёл дважды) — повтор найдёт готовый результат
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") || i >= 3) throw e;
    }
  }
}

/** Сверка: баланс кошелька должен совпадать с суммой журнала. */
export async function verifyWallet(userId: string) {
  const w = await db.wallet.findUnique({ where: { userId } });
  if (!w) return null;
  const sum = await db.ledgerEntry.aggregate({ where: { walletId: w.id }, _sum: { amount: true } });
  const ledger = sum._sum.amount ?? 0n;
  return { balance: w.balance, ledger, ok: ledger === w.balance };
}
