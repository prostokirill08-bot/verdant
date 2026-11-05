// Движки слотов Verdant. Чистые функции: принимают генератор чисел [0, 1) (поток HMAC) и возвращают итог.
// Одинаково работают на сервере и в браузере (проверка честности). Все выплаты — в долях общей ставки.

export type Rng = () => number;
export const rngFromArray = (a: number[]): Rng => { let i = 0; return () => { if (i >= a.length) throw new Error("Недостаточно чисел для пересчёта"); return a[i++]!; }; };

export function pick<T extends string>(rng: Rng, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  for (const [k, w] of entries) { if ((x -= w) < 0) return k; }
  return entries[entries.length - 1]![0];
}
export const r2 = (x: number) => Math.round(x * 10000) / 10000;

export type LineWin = { line: number; sym: string; count: number; mult: number };

/** Выигрыши по линиям слева направо; wild заменяет любой обычный символ. pays — в «ставках на линию». */
export function evalLines(grid: string[][], lines: number[][], pays: Record<string, Record<number, number>>, wild: string, lineShare: number): LineWin[] {
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

// ======================= «Зимний сад» (бывш. «Неоновый сад»): 5×4, 25 линий, джокер, 3+ BONUS — бесплатные вращения =======================
export const NEON = {
  reels: 5, rows: 4,
  lines: [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [0, 1, 2, 1, 0], [1, 2, 3, 2, 1], [3, 2, 1, 2, 3], [2, 1, 0, 1, 2], [0, 1, 0, 1, 0], [1, 0, 1, 0, 1], [2, 3, 2, 3, 2], [3, 2, 3, 2, 3], [1, 2, 1, 2, 1], [2, 1, 2, 1, 2], [0, 0, 1, 0, 0], [3, 3, 2, 3, 3], [1, 1, 0, 1, 1], [2, 2, 3, 2, 2], [0, 1, 1, 1, 0], [3, 2, 2, 2, 3], [1, 0, 0, 0, 1], [2, 3, 3, 3, 2], [0, 0, 1, 2, 3], [3, 3, 2, 1, 0], [1, 2, 2, 2, 1]],
  pays: {
    seven: { 3: 40, 4: 160, 5: 800 }, strawberry: { 3: 15, 4: 60, 5: 250 }, watermelon: { 3: 15, 4: 60, 5: 250 },
    plum: { 3: 7, 4: 28, 5: 110 }, lemon: { 3: 7, 4: 28, 5: 110 }, cherry: { 3: 4, 4: 15, 5: 75 },
  } as Record<string, Record<number, number>>,
  weights: { cherry: 15, lemon: 14, plum: 14, watermelon: 11, strawberry: 11, seven: 3, joker: 1.9, bonus: 1.5 },
  /** BONUS платит как скаттер (× общей ставки) и запускает бесплатные вращения. */
  scatterPays: { 3: 2, 4: 10, 5: 50 } as Record<number, number>,
  freeSpins: 10, fsMultiplier: 3, maxFreeSpins: 100, maxWin: 2500, buyPrice: 26,
};
export type NeonCell = { sym: string };
export type NeonSpin = { grid: NeonCell[][]; wins: LineWin[]; scatter: { count: number; mult: number }; mult: number; retrigger: boolean };
export type NeonResult = { base: NeonSpin | null; bought: boolean; fs: { spins: NeonSpin[]; x: number } | null; totalMult: number; capped: boolean };

function neonSpin(rng: Rng, x = 1): NeonSpin {
  const grid = Array.from({ length: NEON.reels }, (_, reel) => Array.from({ length: NEON.rows }, () => {
    const w = { ...NEON.weights } as Record<string, number>;
    if (reel === 0 || reel === 4) w.joker = 0;            // джокер только на барабанах 2–4
    return { sym: pick(rng, w) };
  }));
  const wins = evalLines(grid.map((c) => c.map((v) => v.sym)), NEON.lines, NEON.pays, "joker", 1 / NEON.lines.length).map((w) => ({ ...w, mult: r2(w.mult * x) }));
  const n = grid.flat().filter((c) => c.sym === "bonus").length;
  const scatter = { count: n, mult: (NEON.scatterPays[Math.min(n, 5)] ?? 0) * x };
  return { grid, wins, scatter, mult: r2(wins.reduce((s, w) => s + w.mult, 0) + scatter.mult), retrigger: n >= 3 };
}
/** Раунд: обычное вращение и, если выпало 3+ BONUS, серия бесплатных вращений с множителем ×2 на все выигрыши. */
export function playNeon(rng: Rng, opts: { buy?: boolean } = {}): NeonResult {
  let total = 0; let base: NeonSpin | null = null; let fs: NeonResult["fs"] = null;
  if (!opts.buy) { base = neonSpin(rng); total += base.mult; }
  if (opts.buy || base!.retrigger) {
    const spins: NeonSpin[] = []; let left = NEON.freeSpins;
    while (left > 0 && spins.length < NEON.maxFreeSpins) {
      const s = neonSpin(rng, NEON.fsMultiplier); spins.push(s); total += s.mult; left--;
      if (s.retrigger) left += NEON.freeSpins;
    }
    fs = { spins, x: NEON.fsMultiplier };
  }
  const capped = total > NEON.maxWin;
  return { base, bought: !!opts.buy, fs, totalMult: r2(Math.min(total, NEON.maxWin)), capped };
}

/** Индекс барабана, начиная с которого включается «интрига»: на предыдущих барабанах уже 2+ бонус-символа. */
export function anticipationFrom(grid: string[][], scatter: string, need = 3): number | null {
  let n = 0;
  for (let reel = 0; reel < grid.length; reel++) {
    if (n >= need - 1) return reel;
    n += grid[reel]!.filter((s) => s === scatter).length;
  }
  return null;
}

/** Сколько чисел из потока может понадобиться слоту (с запасом) — для пересчёта в браузере. */
export const SLOT_FLOATS = 6000;
