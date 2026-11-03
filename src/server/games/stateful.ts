import type { Prisma } from "@prisma/client";
import { HttpError } from "../http";
import { applyEntry, withUserTx } from "../wallet/ledger";
import { takeFloats } from "./fair";
import { loadGame, nextNonce, roundView } from "./rounds";

/**
 * Общая логика пошаговых игр (Башня, Hi-Lo): раунд открывается ставкой, игрок делает ходы,
 * выигрыш забирается вручную или автоматически. Пока раунд идёт, скрытая часть состояния не отдаётся клиенту
 * (roundView показывает только state.revealed).
 */
type Tx = Prisma.TransactionClient;
export type StatefulRound = Awaited<ReturnType<typeof findActive>> & {};

export const findActive = (tx: Tx, userId: string, slug: string) =>
  tx.round.findFirst({ where: { userId, gameSlug: slug, status: "ACTIVE" }, include: { seedPair: true } });

export async function startRound<S extends Prisma.InputJsonObject>(userId: string, slug: string, amount: bigint, key: string, floatsN: number,
  build: (fs: number[], edgeBp: number) => { params: Prisma.InputJsonObject; state: S }) {
  const betKey = `bet:${userId}:${key}`;
  return withUserTx(userId, async (tx) => {
    const dup = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: betKey } });
    if (dup?.roundId) {
      const r = await tx.round.findUniqueOrThrow({ where: { id: dup.roundId }, include: { seedPair: true } });
      return { round: r, balance: (await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance };
    }
    if (await findActive(tx, userId, slug)) throw new HttpError(409, "Сначала заверши текущий раунд", "round_active");
    const game = await loadGame(tx, slug, amount);
    const { pair, nonce } = await nextNonce(tx, userId);
    const { params, state } = build(takeFloats(pair.serverSeed, pair.clientSeed, nonce, floatsN), game.houseEdgeBp);
    const round = await tx.round.create({ data: { userId, gameSlug: slug, seedPairId: pair.id, nonce, betAmount: amount, params: { ...params, edgeBp: game.houseEdgeBp }, state }, include: { seedPair: true } });
    const { entry } = await applyEntry(tx, { userId, type: "BET", amount: -amount, idempotencyKey: betKey, roundId: round.id, note: game.title });
    return { round, balance: entry.balanceAfter };
  });
}

/** Ход в активном раунде. step получает раунд и числа его сида, возвращает новое состояние или итог. */
export async function act<S>(userId: string, slug: string, floatsN: number,
  step: (r: NonNullable<StatefulRound>, fs: number[]) => { state: S; outcome?: { mult: number; result: Prisma.InputJsonObject } | { lost: true; result: Prisma.InputJsonObject }; mult?: number }) {
  return withUserTx(userId, async (tx) => {
    const r = await findActive(tx, userId, slug);
    if (!r || !r.seedPair || r.nonce === null) throw new HttpError(404, "Нет активного раунда", "no_round");
    const fs = takeFloats(r.seedPair.serverSeed, r.seedPair.clientSeed, r.nonce, floatsN);
    const res = step(r, fs);
    const state = res.state as Prisma.InputJsonObject;
    if (res.outcome && "lost" in res.outcome) {
      const done = await tx.round.update({ where: { id: r.id }, include: { seedPair: true }, data: { status: "LOST", multiplier: 0, state, result: res.outcome.result, settledAt: new Date() } });
      return { round: done, balance: (await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance };
    }
    if (res.outcome) return settle(tx, userId, r, res.outcome.mult, state, res.outcome.result);
    const upd = await tx.round.update({ where: { id: r.id }, include: { seedPair: true }, data: { state, multiplier: res.mult ?? 0 } });
    return { round: upd, balance: (await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance };
  });
}

async function settle(tx: Tx, userId: string, r: NonNullable<StatefulRound>, mult: number, state: Prisma.InputJsonObject, result: Prisma.InputJsonObject) {
  const payout = (r.betAmount * BigInt(Math.round(mult * 10000))) / 10000n;
  const { entry } = await applyEntry(tx, { userId, type: "WIN", amount: payout, idempotencyKey: `win:${r.id}`, roundId: r.id, note: r.gameSlug });
  const done = await tx.round.update({ where: { id: r.id }, include: { seedPair: true }, data: { status: "WON", payout, multiplier: mult, state, result, settledAt: new Date() } });
  return { round: done, balance: entry.balanceAfter };
}

export { roundView };
