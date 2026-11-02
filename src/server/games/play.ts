import { z } from "zod";
import { applyEntry, withUserTx } from "../wallet/ledger";
import { HttpError } from "../http";
import { audit } from "../security/audit";
import { takeFloats } from "./fair";
import { amountSchema, INSTANT_GAMES } from "./instant";
import { loadGame, nextNonce, roundView, toJson } from "./rounds";

/** Ключ запроса от клиента: повтор того же запроса (двойной клик, переотправка) не спишет ставку второй раз. */
export const requestKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Неверный ключ запроса");
export const betInput = z.object({ amount: amountSchema.optional(), params: z.unknown(), key: requestKey });

/** Мгновенная игра (Dice, Limbo, Plinko, Roulette): ставка, результат и выплата — одной транзакцией. */
export async function playInstant(userId: string, slug: string, input: z.infer<typeof betInput>, ip: string) {
  const g = INSTANT_GAMES[slug];
  if (!g) throw new HttpError(404, "Игра не найдена", "not_found");
  const params = g.params.parse(input.params);
  const amount = g.total ? g.total(params) : input.amount;
  if (amount === undefined || amount <= 0n) throw new HttpError(400, "Укажи сумму ставки", "bad_amount");
  const betKey = `bet:${userId}:${input.key}`;

  const res = await withUserTx(userId, async (tx) => {
    const dup = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: betKey } });
    if (dup?.roundId) {
      const r = await tx.round.findUniqueOrThrow({ where: { id: dup.roundId }, include: { seedPair: true } });
      const w = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      return { round: roundView(r), balance: w.balance, duplicate: true };
    }
    const game = await loadGame(tx, slug, amount);
    const { pair, nonce } = await nextNonce(tx, userId);
    const storedParams = { ...toJson(params), edgeBp: game.houseEdgeBp };
    const round = await tx.round.create({ data: { userId, gameSlug: slug, seedPairId: pair.id, nonce, betAmount: amount, params: storedParams } });
    await applyEntry(tx, { userId, type: "BET", amount: -amount, idempotencyKey: betKey, roundId: round.id, note: game.title });

    const fs = takeFloats(pair.serverSeed, pair.clientSeed, nonce, g.floats);
    const out = g.resolve(params, fs, amount, game.houseEdgeBp);
    let balance: bigint | undefined;
    if (out.payout > 0n) balance = (await applyEntry(tx, { userId, type: "WIN", amount: out.payout, idempotencyKey: `win:${round.id}`, roundId: round.id, note: game.title })).entry.balanceAfter;
    const done = await tx.round.update({
      where: { id: round.id }, include: { seedPair: true },
      data: { status: out.payout >= amount ? "WON" : "LOST", payout: out.payout, multiplier: out.multiplier, result: toJson(out.result), settledAt: new Date() },
    });
    balance ??= (await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance;
    return { round: roundView(done), balance, duplicate: false };
  });
  if (!res.duplicate && BigInt(res.round.payout) >= 1_000_000n) await audit("game.big_win", { actorId: userId, targetType: "round", targetId: res.round.id, ip, meta: { game: slug, payout: res.round.payout.toString() } });
  return res;
}
