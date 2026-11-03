// Движки слотов Verdant. Чистые функции: принимают генератор чисел [0, 1) (поток HMAC) и возвращают итог.
// Одинаково работают на сервере и в браузере (проверка честности). Все выплаты — в долях общей ставки.

export type Rng = () => number;
export const rngFromArray = (a: number[]): Rng => { let i = 0; return () => { if (i >= a.length) throw new Error("Недостаточно чисел для пересчёта"); return a[i++]!; }; };

function pick<T extends string>(rng: Rng, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  for (const [k, w] of entries) { if ((x -= w) < 0) return k; }
  return entries[entries.length - 1]![0];
}
const r2 = (x: number) => Math.round(x * 10000) / 10000;

type LineWin = { line: number; sym: string; count: number; mult: number };

/** Выигрыши по линиям слева направо; wild заменяет любой обычный символ. pays — в «ставках на линию». */
function evalLines(grid: string[][], lines: number[][], pays: Record<string, Record<number, number>>, wild: string, lineShare: number): LineWin[] {
  const out: LineWin[] = [];
  lines.forEach((pattern, li) => {
    const syms = pattern.map((row, reel) => grid[reel]![row]!);
    const target = syms.find((s) => s !== wild);
    if (!target || !pays[target]) return;
    let n = 0;
    for (const s of syms) { if (s === target || s === wild) n++; else break; }
    const p = pays[target]![n];
    if (p) out.push({ line: li, sym: target, count: n, mult: r2(p * lineShare) });
  });
  return out;
}

// ======================= «Атлас звёзд»: 5×3, 10 линий, книга = wild + scatter =======================
export const ATLAS = {
  reels: 5, rows: 3,
  symbols: ["10", "J", "Q", "K", "A", "comet", "planet", "telescope", "astronaut", "book"] as const,
  lines: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 2, 1, 0, 1]],
  pays: {
    astronaut: { 2: 10, 3: 100, 4: 1000, 5: 5000 }, telescope: { 2: 5, 3: 40, 4: 400, 5: 2000 },
    comet: { 2: 5, 3: 30, 4: 100, 5: 750 }, planet: { 2: 5, 3: 30, 4: 100, 5: 750 },
    A: { 3: 5, 4: 40, 5: 150 }, K: { 3: 5, 4: 40, 5: 150 }, Q: { 3: 5, 4: 25, 5: 100 }, J: { 3: 5, 4: 25, 5: 100 }, "10": { 3: 5, 4: 25, 5: 100 },
  } as Record<string, Record<number, number>>,
  scatterPays: { 3: 2, 4: 20, 5: 200 } as Record<number, number>,   // книга: × общей ставки
  weights: { "10": 17, J: 17, Q: 15, K: 13, A: 13, comet: 7, planet: 7, telescope: 3.6, astronaut: 2.0, book: 2.6 },
  specialWeights: { "10": 16, J: 16, Q: 14, K: 12, A: 12, comet: 9, planet: 9, telescope: 7, astronaut: 5 },
  freeSpins: 10, maxFreeSpins: 100, maxWin: 5000, buyPrice: 51,
};
const ATLAS_HIGH = new Set(["astronaut", "telescope", "comet", "planet"]);
export type AtlasSpin = { grid: string[][]; wins: LineWin[]; scatter: { count: number; mult: number }; expand: { sym: string; reels: number[]; mult: number } | null; mult: number; retrigger: boolean };
export type AtlasResult = { base: AtlasSpin | null; bought: boolean; fs: { special: string; spins: AtlasSpin[] } | null; totalMult: number; capped: boolean };

function atlasGrid(rng: Rng) {
  return Array.from({ length: ATLAS.reels }, () => Array.from({ length: ATLAS.rows }, () => pick(rng, ATLAS.weights) as string));
}
function atlasSpin(rng: Rng, special: string | null): AtlasSpin {
  const grid = atlasGrid(rng);
  const wins = evalLines(grid, ATLAS.lines, ATLAS.pays, "book", 1 / ATLAS.lines.length);
  const books = grid.flat().filter((s) => s === "book").length;
  const scatter = { count: books, mult: ATLAS.scatterPays[books] ?? 0 };
  let expand: AtlasSpin["expand"] = null;
  if (special) {
    // Особый символ раскрывается на весь барабан и платит по всем линиям, даже на несмежных барабанах
    const reels = grid.map((col, i) => (col.includes(special) ? i : -1)).filter((i) => i >= 0);
    const p = ATLAS.pays[special]![reels.length];
    if (reels.length >= (ATLAS_HIGH.has(special) ? 2 : 3) && p) expand = { sym: special, reels, mult: p };
  }
  const mult = r2(wins.reduce((s, w) => s + w.mult, 0) + scatter.mult + (expand?.mult ?? 0));
  return { grid, wins, scatter, expand, mult, retrigger: books >= 3 };
}
/** Один раунд: обычное вращение (или покупка бонуса) и, если выпало 3+ книги, вся серия бесплатных вращений. */
export function playAtlas(rng: Rng, opts: { buy?: boolean } = {}): AtlasResult {
  let total = 0; let base: AtlasSpin | null = null; let fs: AtlasResult["fs"] = null;
  if (!opts.buy) { base = atlasSpin(rng, null); total += base.mult; }
  if (opts.buy || base!.retrigger) {
    const special = pick(rng, ATLAS.specialWeights) as string;
    const spins: AtlasSpin[] = []; let left = ATLAS.freeSpins;
    while (left > 0 && spins.length < ATLAS.maxFreeSpins) {
      const s = atlasSpin(rng, special); spins.push(s); total += s.mult; left--;
      if (s.retrigger) left += ATLAS.freeSpins;
    }
    fs = { special, spins };
  }
  const capped = total > ATLAS.maxWin;
  return { base, bought: !!opts.buy, fs, totalMult: r2(Math.min(total, ATLAS.maxWin)), capped };
}

// ======================= «Неоновый сад»: 5×4, 25 линий, джокер, кристаллы и 5 бонусов =======================
export const NEON = {
  reels: 5, rows: 4,
  lines: [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [0, 1, 2, 1, 0], [1, 2, 3, 2, 1], [3, 2, 1, 2, 3], [2, 1, 0, 1, 2], [0, 1, 0, 1, 0], [1, 0, 1, 0, 1], [2, 3, 2, 3, 2], [3, 2, 3, 2, 3], [1, 2, 1, 2, 1], [2, 1, 2, 1, 2], [0, 0, 1, 0, 0], [3, 3, 2, 3, 3], [1, 1, 0, 1, 1], [2, 2, 3, 2, 2], [0, 1, 1, 1, 0], [3, 2, 2, 2, 3], [1, 0, 0, 0, 1], [2, 3, 3, 3, 2], [0, 0, 1, 2, 3], [3, 3, 2, 1, 0], [1, 2, 2, 2, 1]],
  pays: {
    seven: { 3: 50, 4: 200, 5: 1000 }, strawberry: { 3: 20, 4: 80, 5: 300 }, watermelon: { 3: 20, 4: 80, 5: 300 },
    plum: { 3: 8, 4: 30, 5: 120 }, lemon: { 3: 8, 4: 30, 5: 120 }, cherry: { 3: 4, 4: 15, 5: 75 },
  } as Record<string, Record<number, number>>,
  weights: { cherry: 15, lemon: 14, plum: 14, watermelon: 11, strawberry: 11, seven: 3, joker: 1.9, crystal: 1.5, coin: 2.6 },
  coinValues: { "0.5": 30, "1": 30, "2": 18, "3": 10, "5": 7, "10": 4, "25": 1 },
  features: { chests: 35, boost: 25, collect: 20, mega: 12, jackpot: 8 },
  chestValues: { "2": 30, "3": 25, "5": 20, "8": 12, "10": 8, "15": 3, "25": 1.5, "50": 0.5 },
  boostMults: { "2": 45, "3": 30, "5": 18, "10": 7 },
  jackpots: { mini: 70, major: 26, grand: 4 }, jackpotMult: { mini: 20, major: 100, grand: 1000 } as Record<string, number>,
  boostSpins: 5, coinChance: 0.08, maxWin: 2500, buyPrice: 28,
};
export type NeonCell = { sym: string; value?: number };
export type NeonSpin = { grid: NeonCell[][]; wins: LineWin[]; mult: number };
export type NeonFeature =
  | { type: "chests"; values: number[]; mult: number }
  | { type: "boost"; x: number; spins: NeonSpin[]; mult: number }
  | { type: "collect"; steps: { added: { reel: number; row: number; value: number }[] }[]; coins: { reel: number; row: number; value: number }[]; mult: number }
  | { type: "mega"; x: number; spins: NeonSpin[]; collect: { steps: { added: { reel: number; row: number; value: number }[] }[]; coins: { reel: number; row: number; value: number }[]; mult: number }; mult: number }
  | { type: "jackpot"; level: "mini" | "major" | "grand"; mult: number };
export type NeonResult = { base: NeonSpin | null; bought: boolean; crystals: number; feature: NeonFeature | null; totalMult: number; capped: boolean };

function neonGrid(rng: Rng, noScatter = false): NeonCell[][] {
  return Array.from({ length: NEON.reels }, (_, reel) => Array.from({ length: NEON.rows }, () => {
    const w = { ...NEON.weights } as Record<string, number>;
    if (reel === 0 || reel === 4) w.joker = 0;            // джокер только на барабанах 2–4
    if (noScatter) { w.crystal = 0; }
    const sym = pick(rng, w);
    return sym === "coin" ? { sym, value: Number(pick(rng, NEON.coinValues)) } : { sym };
  }));
}
function neonSpin(rng: Rng, x = 1, noScatter = false): NeonSpin {
  const grid = neonGrid(rng, noScatter);
  const wins = evalLines(grid.map((c) => c.map((x) => x.sym)), NEON.lines, NEON.pays, "joker", 1 / NEON.lines.length).map((w) => ({ ...w, mult: r2(w.mult * x) }));
  return { grid, wins, mult: r2(wins.reduce((s, w) => s + w.mult, 0)) };
}
/** Сбор монет: монеты с поля фиксируются, 3 повторных вращения; каждая новая монета сбрасывает счётчик на 3. */
function neonCollect(rng: Rng, grid: NeonCell[][]) {
  const coins = grid.flatMap((col, reel) => col.map((c, row) => (c.sym === "coin" ? { reel, row, value: c.value! } : null))).filter((c): c is { reel: number; row: number; value: number } => !!c);
  if (coins.length === 0) coins.push({ reel: 2, row: 1, value: Number(pick(rng, NEON.coinValues)) });
  const steps: { added: { reel: number; row: number; value: number }[] }[] = [];
  let lives = 3;
  while (lives > 0 && coins.length < NEON.reels * NEON.rows) {
    const added: { reel: number; row: number; value: number }[] = [];
    for (let reel = 0; reel < NEON.reels; reel++) for (let row = 0; row < NEON.rows; row++) {
      if (coins.some((c) => c.reel === reel && c.row === row)) continue;
      if (rng() < NEON.coinChance) { const c = { reel, row, value: Number(pick(rng, NEON.coinValues)) }; added.push(c); coins.push(c); }
    }
    steps.push({ added });
    lives = added.length ? 3 : lives - 1;
  }
  return { steps, coins, mult: r2(coins.reduce((s, c) => s + c.value, 0)) };
}
export function playNeon(rng: Rng, opts: { buy?: boolean } = {}): NeonResult {
  let total = 0; let base: NeonSpin | null = null; let crystals = 0;
  if (!opts.buy) { base = neonSpin(rng); total += base.mult; crystals = base.grid.flat().filter((c) => c.sym === "crystal").length; }
  let feature: NeonFeature | null = null;
  if (opts.buy || crystals >= 3) {
    const type = pick(rng, NEON.features);
    const grid = base?.grid ?? neonGrid(rng, true);
    if (type === "chests") { const values = [0, 1, 2].map(() => Number(pick(rng, NEON.chestValues))); feature = { type, values, mult: r2(values.reduce((a, b) => a + b, 0)) }; }
    else if (type === "boost" || type === "mega") {
      const x = Number(pick(rng, NEON.boostMults)); const spins = Array.from({ length: NEON.boostSpins }, () => neonSpin(rng, x, true));
      const sm = r2(spins.reduce((s, sp) => s + sp.mult, 0));
      if (type === "boost") feature = { type, x, spins, mult: sm };
      else { const collect = neonCollect(rng, grid); feature = { type, x, spins, collect, mult: r2(sm + collect.mult) }; }
    } else if (type === "collect") { const c = neonCollect(rng, grid); feature = { type, ...c }; }
    else { const level = pick(rng, NEON.jackpots); feature = { type: "jackpot", level, mult: NEON.jackpotMult[level]! }; }
    total += feature.mult;
  }
  const capped = total > NEON.maxWin;
  return { base, bought: !!opts.buy, crystals, feature, totalMult: r2(Math.min(total, NEON.maxWin)), capped };
}

/** Сколько чисел из потока может понадобиться слоту (с запасом) — для пересчёта в браузере. */
export const SLOT_FLOATS = 6000;
