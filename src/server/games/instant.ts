import { z } from "zod";
import {
  diceMultiplier, diceRoll, diceWin, limboResult, plinkoPath, PLINKO_TABLE, roulettePayout, rouletteNumber, rouletteColor,
  type PlinkoRows, type RouletteBetKind,
} from "@/lib/fair/outcomes";
import { toUnits } from "@/lib/money";

/** Сумма ставки приходит строкой баллов («12.5»), на сервере переводится в сотые. */
export const amountSchema = z.string().max(16).regex(/^\d+([.,]\d{1,2})?$/, "Неверная сумма ставки").transform((s) => toUnits(s));
const twoDp = (x: number) => Math.round(x * 100) / 100;

const rouletteBet = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("straight"), n: z.number().int().min(0).max(36) }),
  z.object({ kind: z.literal("red") }), z.object({ kind: z.literal("black") }),
  z.object({ kind: z.literal("even") }), z.object({ kind: z.literal("odd") }),
  z.object({ kind: z.literal("low") }), z.object({ kind: z.literal("high") }),
  z.object({ kind: z.literal("dozen"), n: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  z.object({ kind: z.literal("column"), n: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
]);

type Outcome = { payout: bigint; multiplier: number; result: Record<string, unknown> };
type InstantGame<P> = {
  params: z.ZodType<P, z.ZodTypeDef, unknown>;
  floats: number;
  /** Сумма ставки, если она задаётся параметрами (рулетка: сумма фишек). */
  total?: (p: P) => bigint;
  resolve: (p: P, fs: number[], bet: bigint, edgeBp: number) => Outcome;
};

const byMult = (bet: bigint, m: number) => (bet * BigInt(Math.round(m * 10000))) / 10000n;

const dice: InstantGame<{ target: number; over: boolean }> = {
  params: z.object({ target: z.number().min(2, "Порог от 2 до 98").max(98, "Порог от 2 до 98").transform(twoDp), over: z.boolean() }),
  floats: 1,
  resolve(p, fs, bet, edgeBp) {
    const roll = diceRoll(fs[0]!); const win = diceWin(roll, p.target, p.over); const m = diceMultiplier(p.target, p.over, edgeBp);
    return { payout: win ? byMult(bet, m) : 0n, multiplier: win ? m : 0, result: { roll, win, target: p.target, over: p.over, payoutMultiplier: m } };
  },
};

const limbo: InstantGame<{ target: number }> = {
  params: z.object({ target: z.number().min(1.01, "Цель от 1,01×").max(1_000_000, "Цель до 1 000 000×").transform(twoDp) }),
  floats: 1,
  resolve(p, fs, bet, edgeBp) {
    const value = limboResult(fs[0]!, edgeBp); const win = value >= p.target;
    return { payout: win ? byMult(bet, p.target) : 0n, multiplier: win ? p.target : 0, result: { value, win, target: p.target } };
  },
};

const plinko: InstantGame<{ rows: PlinkoRows; risk: "low" | "medium" | "high" }> = {
  params: z.object({ rows: z.union([z.literal(8), z.literal(12), z.literal(16)]), risk: z.enum(["low", "medium", "high"]) }),
  floats: 16,
  resolve(p, fs, bet) {
    const { path, bucket } = plinkoPath(fs, p.rows); const m = PLINKO_TABLE[p.rows][p.risk][bucket]!;
    return { payout: byMult(bet, m), multiplier: m, result: { path, bucket, rows: p.rows, risk: p.risk } };
  },
};

type RouletteParams = { bets: { bet: RouletteBetKind; amount: bigint }[] };
const roulette: InstantGame<RouletteParams> = {
  params: z.object({ bets: z.array(z.object({ bet: rouletteBet, amount: amountSchema })).min(1, "Поставь хотя бы одну фишку").max(60, "Слишком много фишек") })
    .refine((p) => p.bets.every((b) => b.amount > 0n), "Пустая фишка"),
  floats: 1,
  total: (p) => p.bets.reduce((s, b) => s + b.amount, 0n),
  resolve(p, fs, bet) {
    const n = rouletteNumber(fs[0]!);
    const payout = p.bets.reduce((s, b) => s + b.amount * BigInt(roulettePayout(b.bet, n)), 0n);
    return { payout, multiplier: Number((payout * 10000n) / bet) / 10000, result: { number: n, color: rouletteColor(n) } };
  },
};

export const INSTANT_GAMES = { dice, limbo, plinko, roulette } as Record<string, InstantGame<unknown>>;
export type InstantSlug = "dice" | "limbo" | "plinko" | "roulette";
export const isInstant = (s: string): s is InstantSlug => s in INSTANT_GAMES;
