// Чистые функции «числа из HMAC → результат игры». Одинаково работают на сервере и в браузере (страница проверки).
// Все таблицы и формулы открыты — игрок может пересчитать любой раунд сам.

export const MINES_TILES = 25;
export const ROULETTE_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26] as const;
export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/** Округление множителя вниз до 4 знаков — выплата никогда не больше заявленной. */
const floor4 = (x: number) => Math.floor(x * 10000 + 1e-9) / 10000;
const floor2 = (x: number) => Math.floor(x * 100 + 1e-9) / 100;

/** Сколько чисел из потока нужно каждой игре. */
export const FLOATS_NEEDED = { dice: 1, limbo: 1, roulette: 1, plinko: 16, mines: 24, crash: 1 } as const;

// ---------- Dice ----------
/** Бросок 0.00 … 100.00 (10 001 вариант). */
export const diceRoll = (f: number) => Math.floor(f * 10001) / 100;
export const diceChance = (target: number, over: boolean) => (over ? 100 - target : target);
export const diceMultiplier = (target: number, over: boolean, edgeBp: number) => floor4((100 - edgeBp / 100) / diceChance(target, over));
export const diceWin = (roll: number, target: number, over: boolean) => (over ? roll > target : roll < target);

// ---------- Limbo / Crash ----------
/** Множитель ≥ 1.00. Вероятность получить ≥ X равна (1 − edge) / X. */
export function limboResult(f: number, edgeBp: number, cap = 1_000_000) {
  const v = floor2((1 - edgeBp / 10000) / (1 - f));
  return Math.min(Math.max(v, 1), cap);
}
export const crashPoint = (f: number, edgeBp: number) => limboResult(f, edgeBp, 10_000);
export const limboChance = (target: number, edgeBp: number) => ((1 - edgeBp / 10000) / target) * 100;

// ---------- Roulette ----------
export type RouletteBetKind =
  | { kind: "straight"; n: number } | { kind: "red" } | { kind: "black" } | { kind: "even" } | { kind: "odd" }
  | { kind: "low" } | { kind: "high" } | { kind: "dozen"; n: 1 | 2 | 3 } | { kind: "column"; n: 1 | 2 | 3 };

export const rouletteNumber = (f: number) => Math.floor(f * 37);
/** Полная выплата (с учётом ставки): 36×, 3×, 2× или 0. */
export function roulettePayout(bet: RouletteBetKind, n: number): number {
  switch (bet.kind) {
    case "straight": return bet.n === n ? 36 : 0;
    case "red": return RED_NUMBERS.has(n) ? 2 : 0;
    case "black": return n !== 0 && !RED_NUMBERS.has(n) ? 2 : 0;
    case "even": return n !== 0 && n % 2 === 0 ? 2 : 0;
    case "odd": return n % 2 === 1 ? 2 : 0;
    case "low": return n >= 1 && n <= 18 ? 2 : 0;
    case "high": return n >= 19 ? 2 : 0;
    case "dozen": return n !== 0 && Math.ceil(n / 12) === bet.n ? 3 : 0;
    case "column": return n !== 0 && ((n - 1) % 3) + 1 === bet.n ? 3 : 0;
  }
}
export const rouletteColor = (n: number) => (n === 0 ? "green" : RED_NUMBERS.has(n) ? "red" : "black");

// ---------- Plinko ----------
export const PLINKO_ROWS = [8, 12, 16] as const;
export const PLINKO_RISKS = ["low", "medium", "high"] as const;
export type PlinkoRows = (typeof PLINKO_ROWS)[number];
export type PlinkoRisk = (typeof PLINKO_RISKS)[number];
/** Собственные таблицы Verdant: RTP ≈ 98–99% (см. plinkoRtp). */
export const PLINKO_TABLE: Record<PlinkoRows, Record<PlinkoRisk, number[]>> = {
  8: {
    low: [5, 2.9, 1.47, 0.71, 0.5, 0.71, 1.47, 2.9, 5],
    medium: [12, 4.5, 1.35, 0.48, 0.4, 0.48, 1.35, 4.5, 12],
    high: [25, 6.4, 1.09, 0.23, 0.2, 0.23, 1.09, 6.4, 25],
  },
  12: {
    low: [9, 5.9, 3.6, 2.1, 1.07, 0.61, 0.5, 0.61, 1.07, 2.1, 3.6, 5.9, 9],
    medium: [32, 16, 7, 2.5, 0.78, 0.33, 0.3, 0.33, 0.78, 2.5, 7, 16, 32],
    high: [140, 42, 9.6, 1.6, 0.29, 0.2, 0.2, 0.2, 0.29, 1.6, 9.6, 42, 140],
  },
  16: {
    low: [15, 11, 7.3, 4.7, 2.8, 1.59, 0.88, 0.56, 0.5, 0.56, 0.88, 1.59, 2.8, 4.7, 7.3, 11, 15],
    medium: [90, 49, 24, 11, 4.1, 1.33, 0.46, 0.31, 0.3, 0.31, 0.46, 1.33, 4.1, 11, 24, 49, 90],
    high: [800, 260, 68, 14, 2.3, 0.38, 0.21, 0.2, 0.2, 0.2, 0.21, 0.38, 2.3, 14, 68, 260, 800],
  },
};
/** Путь шарика: на каждом ряду 0 — влево, 1 — вправо. Лунка = число шагов вправо. */
export function plinkoPath(fs: number[], rows: PlinkoRows) {
  const path = fs.slice(0, rows).map((f) => (f < 0.5 ? 0 : 1));
  return { path, bucket: path.reduce<number>((a, b) => a + b, 0) };
}
export function plinkoRtp(rows: PlinkoRows, risk: PlinkoRisk) {
  let c = 1, sum = 0; const t = PLINKO_TABLE[rows][risk];
  for (let k = 0; k <= rows; k++) { sum += (c / 2 ** rows) * t[k]!; c = (c * (rows - k)) / (k + 1); }
  return sum;
}

// ---------- Mines ----------
/** Расстановка мин: тасование Фишера — Йетса по 24 числам, первые `mines` клеток — мины. */
export function minesLayout(fs: number[], mines: number): number[] {
  const tiles = Array.from({ length: MINES_TILES }, (_, i) => i);
  for (let i = 0; i < MINES_TILES - 1; i++) {
    const j = i + Math.floor(fs[i]! * (MINES_TILES - i));
    [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
  }
  return tiles.slice(0, mines).sort((a, b) => a - b);
}
/** Множитель после `safe` открытых безопасных клеток: (1 − edge) · C(25, k) / C(25 − m, k). */
export function minesMultiplier(mines: number, safe: number, edgeBp: number) {
  if (safe === 0) return 1;
  let m = 1;
  for (let i = 0; i < safe; i++) m *= (MINES_TILES - i) / (MINES_TILES - mines - i);
  return floor4(m * (1 - edgeBp / 10000));
}

// ---------- Crash: кривая роста ----------
export const CRASH_GROWTH = 0.00006; // множитель = e^(k·t), t в мс → 2× за ~11,6 с
export const crashMultiplierAt = (ms: number) => floor2(Math.exp(CRASH_GROWTH * Math.max(ms, 0)));
export const crashTimeFor = (m: number) => Math.log(m) / CRASH_GROWTH;
