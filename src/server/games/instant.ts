import { z } from "zod";
import { AVA, CRY, SAL, playAvalanche, playCrystal, playSalute } from "@/lib/fair/slots2";
import {
  diceMultiplier, diceRoll, diceWin, limboResult, plinkoPath, PLINKO_TABLE, roulettePayout, rouletteNumber, rouletteColor,
  type PlinkoRows, type RouletteBetKind,
} from "@/lib/fair/outcomes";
import { toUnits } from "@/lib/money";
import { ATLAS, NEON, playAtlas, playNeon, type Rng } from "@/lib/fair/slots";
import { decodeMeters, encodeMeters, playWorkshop } from "@/lib/fair/workshop";
import { BAC_FLOATS, baccarat as playBaccarat, baccaratPayout, SLED_FLOATS, SLEDS, sledMult, sledRace } from "@/lib/fair/cards";
import { COIN_MAX_FLIPS, coinMultiplier, coinSides, KENO_PAYS, kenoDraw, WHEEL, wheelSegment, type WheelRisk } from "@/lib/fair/extra";

/** Сумма ставки приходит строкой рублей («12.5»), на сервере переводится в сотые. */
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

type Outcome = { payout: bigint; multiplier: number; result: Record<string, unknown>; state?: string };
type InstantGame<P> = {
  params: z.ZodType<P, z.ZodTypeDef, unknown>;
  /** Сколько чисел нужно заранее (fs). Слоты берут числа из потока rng по мере надобности. */
  floats: number;
  /** Сумма ставки, если она задаётся параметрами (рулетка: сумма фишек). */
  total?: (p: P) => bigint;
  /** Сколько списать: для покупки бонуса — ставка × цена бонуса. */
  cost?: (p: P, bet: bigint) => bigint;
  /** Игра с накопительным состоянием между раундами (сундуки): state — строка до раунда, Outcome.state — после. */
  persist?: boolean;
  resolve: (p: P, fs: number[], bet: bigint, edgeBp: number, rng: Rng, state?: string) => Outcome;
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

const coinflip: InstantGame<{ side: "heads" | "tails"; flips: number }> = {
  params: z.object({ side: z.enum(["heads", "tails"]), flips: z.number().int().min(1, "От 1 до 10 бросков").max(COIN_MAX_FLIPS, "От 1 до 10 бросков") }),
  floats: COIN_MAX_FLIPS,
  resolve(p, fs, bet, edgeBp) {
    const sides = coinSides(fs, p.flips); const win = sides.every((x) => x === p.side); const m = coinMultiplier(p.flips, edgeBp);
    return { payout: win ? byMult(bet, m) : 0n, multiplier: win ? m : 0, result: { sides, win, side: p.side, flips: p.flips, payoutMultiplier: m } };
  },
};

const wheel: InstantGame<{ risk: WheelRisk }> = {
  params: z.object({ risk: z.enum(["low", "medium", "high"]) }),
  floats: 1,
  resolve(p, fs, bet) {
    const segment = wheelSegment(fs[0]!); const m = WHEEL[p.risk][segment]!;
    return { payout: byMult(bet, m), multiplier: m, result: { segment, risk: p.risk, multiplier: m } };
  },
};

const keno: InstantGame<{ picks: number[] }> = {
  params: z.object({ picks: z.array(z.number().int().min(1).max(40)).min(1, "Выбери от 1 до 10 чисел").max(10, "Выбери от 1 до 10 чисел") })
    .refine((p) => new Set(p.picks).size === p.picks.length, "Числа не должны повторяться"),
  floats: 10,
  resolve(p, fs, bet) {
    const drawn = kenoDraw(fs); const hits = p.picks.filter((n) => drawn.includes(n));
    const m = KENO_PAYS[p.picks.length]![hits.length] ?? 0;
    return { payout: byMult(bet, m), multiplier: m, result: { drawn, hits, picks: p.picks } };
  },
};

/** Баккара: фишки на Игрока, Банкира и Ничью; сумма ставки — сумма фишек. */
type BacParams = { player: bigint; banker: bigint; tie: bigint };
const zeroable = z.string().max(16).regex(/^\d+([.,]\d{1,2})?$/, "Неверная сумма ставки").transform((s) => toUnits(s));
const baccarat: InstantGame<BacParams> = {
  params: z.object({ player: zeroable.default("0"), banker: zeroable.default("0"), tie: zeroable.default("0") })
    .refine((p) => p.player + p.banker + p.tie > 0n, "Поставь фишку хотя бы на одно поле"),
  floats: BAC_FLOATS,
  total: (p) => p.player + p.banker + p.tie,
  resolve(p, fs, bet) {
    const r = playBaccarat(fs); const payout = baccaratPayout(p, r.winner);
    return { payout, multiplier: Number((payout * 10000n) / bet) / 10000, result: r };
  },
};

/** Гонка на санях: ставка на одного из пяти саночников. */
const sledrace: InstantGame<{ pick: number }> = {
  params: z.object({ pick: z.number().int().min(0).max(SLEDS.length - 1) }),
  floats: SLED_FLOATS,
  resolve(p, fs, bet, edgeBp) {
    const r = sledRace(fs); const m = sledMult(p.pick, edgeBp); const win = r.winner === p.pick;
    return { payout: win ? byMult(bet, m) : 0n, multiplier: win ? m : 0, result: { ...r, pick: p.pick, payoutMultiplier: m } };
  },
};

/** Слоты: множитель считается от базовой ставки; при покупке бонуса списывается ставка × цена бонуса. */
function slot(price: number, play: (rng: Rng, o: { buy?: boolean }) => { totalMult: number }): InstantGame<{ buy: boolean }> {
  return {
    params: z.object({ buy: z.boolean().default(false) }),
    floats: 0,
    cost: (p, bet) => (p.buy ? bet * BigInt(price) : bet),
    resolve(p, _fs, bet, _edge, rng) {
      const r = play(rng, { buy: p.buy });
      return { payout: byMult(bet, r.totalMult), multiplier: r.totalMult, result: r as unknown as Record<string, unknown> };
    },
  };
}
const atlas = slot(ATLAS.buyPrice, playAtlas);
const neonGarden = slot(NEON.buyPrice, playNeon);
const avalanche = slot(AVA.buyPrice, playAvalanche);
const salute = slot(SAL.buyPrice, playSalute);
const crystal = slot(CRY.buyPrice, playCrystal);

/** «Мастерская Санты»: монеты наполняют сундуки, состояние сундуков хранится между спинами. */
const workshop: InstantGame<Record<string, never>> = {
  params: z.object({}).strip() as unknown as z.ZodType<Record<string, never>, z.ZodTypeDef, unknown>,
  floats: 0,
  persist: true,
  resolve(_p, _fs, bet, _edge, rng, state) {
    const r = playWorkshop(rng, decodeMeters(state), Number(bet));
    return { payout: BigInt(r.total), multiplier: r.totalMult, result: r as unknown as Record<string, unknown>, state: encodeMeters(r.after) };
  },
};

export const INSTANT_GAMES = { avalanche, salute, crystal, workshop, dice, limbo, plinko, roulette, atlas, "neon-garden": neonGarden, coinflip, wheel, keno, baccarat, sledrace } as Record<string, InstantGame<unknown>>;
export type InstantSlug = "avalanche" | "salute" | "crystal" | "workshop" | "dice" | "limbo" | "plinko" | "roulette" | "atlas" | "neon-garden" | "coinflip" | "wheel" | "keno" | "baccarat" | "sledrace";
export const isInstant = (s: string): s is InstantSlug => s in INSTANT_GAMES;
