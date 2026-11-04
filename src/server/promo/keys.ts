import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getRedis } from "../redis";

/**
 * Снежные ключи и джекпот сундука. 4 ключа открывают сундук. С каждой ставки 0,5% «капает» в джекпот (Redis).
 *
 * Шанс ключа пропорционален ставке: в среднем 1 ключ на KEY_PER_WAGER поставленных рублей (ставка 20 ₽ — шанс 1%,
 * 2 000 ₽ и больше — ключ гарантирован). Так ключи нельзя «нафармить» мелкими ставками: раньше шанс был 1 к 40
 * за любую ставку от 1 ₽, и ставки по 1 ₽ приносили больше, чем стоили (тест-драйв: акция выдала 104% проигрыша).
 * Вместе с призами сундука акция возвращает игрокам ~1,7% оборота.
 */
export const KEYS_NEEDED = 4;
export const KEY_PER_WAGER = 200_000n;         // 2 000 ₽ ставок ≈ 1 ключ
export const KEY_MIN_BET = 100n;               // 1 ₽ — минимум для турнира и ключей
export const JACKPOT_BASE = 2_500_000n;        // 25 000 ₽
const JACKPOT_KEY = "promo:jackpot";
const mem = globalThis as unknown as { jackpot?: bigint };

/** Вызывается из журнала при каждой ставке (внутри транзакции игрока). */
export async function onBet(tx: Prisma.TransactionClient, userId: string, amount: bigint) {
  if (amount < KEY_MIN_BET) return;
  const add = amount / 200n;   // 0,5%
  if (add > 0n) {
    const r = getRedis();
    if (r) r.incrby(JACKPOT_KEY, Number(add)).catch(() => {}); else mem.jackpot = (mem.jackpot ?? 0n) + add;
  }
  // ключ с вероятностью amount / KEY_PER_WAGER (не больше одного ключа за ставку)
  if (BigInt(randomInt(Number(KEY_PER_WAGER))) >= amount) return;
  const s = await tx.promoState.findUnique({ where: { userId } });
  if ((s?.keys ?? 0) >= KEYS_NEEDED) return;   // сундук полон — сначала открыть
  await tx.promoState.upsert({ where: { userId }, create: { userId, keys: 1 }, update: { keys: { increment: 1 } } });
}

export async function jackpotPool(): Promise<bigint> {
  const r = getRedis();
  const extra = r ? BigInt((await r.get(JACKPOT_KEY).catch(() => null)) ?? "0") : mem.jackpot ?? 0n;
  return JACKPOT_BASE + extra;
}
/** Забрать весь накопленный джекпот (атомарно обнуляет накопление). */
export async function takeJackpot(): Promise<bigint> {
  const r = getRedis();
  if (r) return JACKPOT_BASE + BigInt((await r.getset(JACKPOT_KEY, "0").catch(() => null)) ?? "0");
  const v = mem.jackpot ?? 0n; mem.jackpot = 0n; return JACKPOT_BASE + v;
}
