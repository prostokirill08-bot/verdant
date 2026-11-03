import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { BJ_FLOATS, bjAct, bjAllowed, bjDeal, bjSettle, bjTotal, type BjAction, type BjState } from "@/lib/fair/cards";
import { db } from "../db";
import { HttpError } from "../http";
import { applyEntry, withUserTx } from "../wallet/ledger";
import { takeFloats } from "./fair";
import { amountSchema } from "./instant";
import { requestKey } from "./play";
import { findActive, roundView, type StatefulRound } from "./stateful";
import { loadGame, nextNonce } from "./rounds";

/**
 * Блэкджек: ставка открывает раунд, игрок берёт карты, удваивает или делит пару.
 * Удвоение и сплит списывают ещё одну базовую ставку отдельной записью журнала.
 * Пока раунд идёт, закрытая карта дилера клиенту не отдаётся.
 */
type Tx = Prisma.TransactionClient;
type Round = NonNullable<StatefulRound>;
export const bjStart = z.object({ amount: amountSchema, key: requestKey });
export const bjMove = z.object({ action: z.enum(["hit", "stand", "double", "split"]) });

const base = (r: Round) => BigInt((r.params as { base: string }).base);
const staked = (s: BjState) => s.hands.reduce((n, h) => n + h.bet, 0);

function view(r: Round) {
  const s = r.state as BjState; const done = r.status !== "ACTIVE";
  const dealer = done || s.finished ? s.dealer : [s.dealer[0]!];
  return {
    ...roundView(r),
    state: {},
    table: {
      hands: s.hands.map((h) => ({ ...h, total: bjTotal(h.cards) })),
      dealer, dealerTotal: bjTotal(dealer), hidden: !(done || s.finished), active: s.active,
      allowed: done ? { hit: false, stand: false, double: false, split: false } : bjAllowed(s),
      outcomes: done ? bjSettle(s).outcomes : null, base: (r.params as { base: string }).base,
    },
  };
}

/** Закрыть раунд: выплата = базовая ставка × сумма по рукам (блэкджек 3:2). */
async function finish(tx: Tx, userId: string, r: Round, s: BjState) {
  const { ret, outcomes } = bjSettle(s); const b = base(r); const bet = b * BigInt(staked(s));
  const payout = (b * BigInt(Math.round(ret * 2))) / 2n;
  if (payout > 0n) await applyEntry(tx, { userId, type: "WIN", amount: payout, idempotencyKey: `win:${r.id}`, roundId: r.id, note: "Блэкджек" });
  const mult = Number((payout * 10000n) / bet) / 10000;
  return tx.round.update({
    where: { id: r.id }, include: { seedPair: true },
    data: { status: payout > 0n ? "WON" : "LOST", betAmount: bet, payout, multiplier: mult, state: s as unknown as Prisma.InputJsonObject, result: { outcomes, actions: s.actions, player: s.hands.map((h) => bjTotal(h.cards).total), dealer: bjTotal(s.dealer).total }, settledAt: new Date() },
  });
}

export async function blackjackActive(userId: string) {
  const r = await findActive(db, userId, "blackjack");
  return r ? view(r) : null;
}

export async function startBlackjack(userId: string, input: z.infer<typeof bjStart>) {
  const betKey = `bet:${userId}:${input.key}`;
  const res = await withUserTx(userId, async (tx) => {
    const dup = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: betKey } });
    if (dup?.roundId) return tx.round.findUniqueOrThrow({ where: { id: dup.roundId }, include: { seedPair: true } });
    if (await findActive(tx, userId, "blackjack")) throw new HttpError(409, "Сначала доиграй текущую раздачу", "round_active");
    const game = await loadGame(tx, "blackjack", input.amount);
    const { pair, nonce } = await nextNonce(tx, userId);
    const s = bjDeal(takeFloats(pair.serverSeed, pair.clientSeed, nonce, BJ_FLOATS));
    const round = await tx.round.create({
      data: { userId, gameSlug: "blackjack", seedPairId: pair.id, nonce, betAmount: input.amount, params: { base: input.amount.toString(), edgeBp: game.houseEdgeBp }, state: s as unknown as Prisma.InputJsonObject },
      include: { seedPair: true },
    });
    await applyEntry(tx, { userId, type: "BET", amount: -input.amount, idempotencyKey: betKey, roundId: round.id, note: game.title });
    return s.finished ? finish(tx, userId, round, s) : round;
  });
  return { round: view(res), balance: (await db.wallet.findUniqueOrThrow({ where: { userId } })).balance };
}

export async function moveBlackjack(userId: string, action: BjAction) {
  const res = await withUserTx(userId, async (tx) => {
    const r = await findActive(tx, userId, "blackjack");
    if (!r || !r.seedPair || r.nonce === null) throw new HttpError(404, "Нет активной раздачи", "no_round");
    const prev = r.state as BjState;
    let s: BjState;
    try { s = bjAct(prev, action, takeFloats(r.seedPair.serverSeed, r.seedPair.clientSeed, r.nonce, BJ_FLOATS)); }
    catch { throw new HttpError(400, "Это действие сейчас недоступно", "not_allowed"); }
    // Удвоение или сплит — ещё одна базовая ставка
    const extra = staked(s) - staked(prev);
    if (extra > 0) await applyEntry(tx, { userId, type: "BET", amount: -base(r) * BigInt(extra), idempotencyKey: `bet:${r.id}:${s.actions.length}`, roundId: r.id, note: action === "split" ? "Блэкджек: сплит" : "Блэкджек: удвоение" });
    if (s.finished) return finish(tx, userId, r, s);
    return tx.round.update({ where: { id: r.id }, include: { seedPair: true }, data: { betAmount: base(r) * BigInt(staked(s)), state: s as unknown as Prisma.InputJsonObject } });
  });
  return { round: view(res), balance: (await db.wallet.findUniqueOrThrow({ where: { userId } })).balance };
}
