// Слоты третьей волны: «Сладкий взрыв», «Большой улов», «Звёздные врата».
// Чистые функции от потока случайных чисел [0, 1) — одинаково на сервере и в браузере (страница «Честность»).
// Все выплаты — в долях общей ставки.
import { ATLAS } from "./slots";
import { evalLines, pick, r2, type LineWin, type Rng } from "./slots";

// ============ «Сладкий взрыв»: 7×7, кластеры от 5 символов, каскады; бонус — клетки-множители ============
export const SWT = {
  reels: 7, rows: 7,
  /** Выплата за кластер 5 / 6 / 7 / 8 / 9–10 / 11–12 / 13–14 / 15+ (× общей ставки). */
  pays: {
    heart: [6.05, 9.08, 12.11, 18.16, 30.25, 60.52, 151.29, 453.86], ginger: [3.63, 5.45, 7.26, 10.89, 18.16, 36.31, 90.77, 242.06],
    cane: [2.42, 3.63, 4.83, 7.26, 12.11, 24.2, 60.52, 151.29], cupcake: [1.82, 2.72, 3.63, 5.45, 9.08, 18.16, 45.39, 121.03],
    drop_red: [1.21, 1.82, 2.42, 3.63, 6.05, 12.11, 30.25, 72.61], drop_purple: [0.97, 1.45, 1.94, 2.91, 4.83, 9.68, 24.2, 60.52],
    drop_green: [0.72, 1.09, 1.45, 2.17, 3.63, 7.26, 18.16, 48.41], drop_blue: [0.61, 0.91, 1.21, 1.82, 3.03, 6.05, 15.13, 36.31],
  } as Record<string, number[]>,
  weights: { drop_blue: 20, drop_green: 18, drop_purple: 16, drop_red: 14, cupcake: 10, cane: 8, ginger: 6, heart: 4, scatter: 0.75 },
  fsWeights: { drop_blue: 26, drop_green: 24, drop_purple: 20, drop_red: 16, cupcake: 9, cane: 7, ginger: 5, heart: 3.5, scatter: 0.6 },
  /** Сколько бесплатных вращений за 3–7 конфет-бонусов. */
  freeSpins: { 3: 10, 4: 12, 5: 15, 6: 20, 7: 30 } as Record<number, number>,
  retrigger: 5, maxFreeSpins: 80, maxSpot: 128, maxWin: 5000, buyPrice: 47,
};
export type SwtWin = { sym: string; size: number; base: number; x: number; mult: number; cells: string[] };
/** Шаг каскада: поле, выигрышные кластеры и клетки-множители ПОСЛЕ шага (ключ "reel:row" → 1 — отмечена, 2…128 — множитель). */
export type SwtStep = { grid: string[][]; wins: SwtWin[]; mult: number; spots: Record<string, number> };
export type SwtSpin = { steps: SwtStep[]; scatters: number; mult: number; trigger: number };
export type SwtResult = { base: SwtSpin | null; bought: boolean; fs: { spins: SwtSpin[] } | null; totalMult: number; capped: boolean };

const swtTier = (n: number) => (n >= 15 ? 7 : n >= 13 ? 6 : n >= 11 ? 5 : n >= 9 ? 4 : n - 5);
/** Кластеры: соседние по горизонтали и вертикали одинаковые символы, от 5 штук. */
function swtClusters(grid: string[][]): { sym: string; cells: string[] }[] {
  const seen = new Set<string>(); const out: { sym: string; cells: string[] }[] = [];
  for (let r = 0; r < SWT.reels; r++) for (let row = 0; row < SWT.rows; row++) {
    const k = `${r}:${row}`; const sym = grid[r]![row]!;
    if (seen.has(k) || !SWT.pays[sym]) continue;
    const cells: string[] = []; const stack = [[r, row]];
    seen.add(k);
    while (stack.length) {
      const [a, b] = stack.pop()!; cells.push(`${a}:${b}`);
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const na = a! + da!, nb = b! + db!; const nk = `${na}:${nb}`;
        if (na < 0 || nb < 0 || na >= SWT.reels || nb >= SWT.rows || seen.has(nk) || grid[na]![nb] !== sym) continue;
        seen.add(nk); stack.push([na, nb]);
      }
    }
    if (cells.length >= 5) out.push({ sym, cells });
  }
  return out;
}
/**
 * Вращение с каскадами. spots — клетки-множители: первая победа в клетке отмечает её, каждая следующая
 * удваивает множитель (×2 → ×4 → … ×128). Множитель кластера — сумма множителей его клеток (или ×1).
 * В основной игре клетки сбрасываются каждое вращение, в бонусе — остаются до конца.
 */
function swtSpin(rng: Rng, weights: Record<string, number>, spots: Map<string, number>): SwtSpin {
  let grid = Array.from({ length: SWT.reels }, () => Array.from({ length: SWT.rows }, () => pick(rng, weights) as string));
  const scatters = grid.flat().filter((s) => s === "scatter").length;
  const steps: SwtStep[] = []; let total = 0;
  for (let guard = 0; guard < 60; guard++) {
    const clusters = swtClusters(grid);
    const wins: SwtWin[] = clusters.map((c) => {
      const base = SWT.pays[c.sym]![swtTier(c.cells.length)]!;
      const x = c.cells.reduce((s, k) => s + ((spots.get(k) ?? 0) >= 2 ? spots.get(k)! : 0), 0) || 1;
      return { sym: c.sym, size: c.cells.length, base, x, mult: r2(base * x), cells: c.cells };
    });
    const sum = wins.reduce((s, w) => s + w.mult, 0); total += sum;
    for (const w of wins) for (const k of w.cells) { const v = spots.get(k) ?? 0; spots.set(k, v === 0 ? 1 : Math.min(SWT.maxSpot, v === 1 ? 2 : v * 2)); }
    steps.push({ grid, wins, mult: r2(sum), spots: Object.fromEntries(spots) });
    if (!wins.length) break;
    const gone = new Set(wins.flatMap((w) => w.cells));
    grid = grid.map((col, r) => {
      const keep = col.filter((_, row) => !gone.has(`${r}:${row}`));
      const fresh = Array.from({ length: SWT.rows - keep.length }, () => pick(rng, { ...weights, scatter: 0 }) as string);
      return [...fresh, ...keep];
    });
  }
  return { steps, scatters, mult: r2(total), trigger: SWT.freeSpins[Math.min(scatters, 7)] ?? 0 };
}
export function playSweets(rng: Rng, opts: { buy?: boolean } = {}): SwtResult {
  let total = 0; let base: SwtSpin | null = null; let fs: SwtResult["fs"] = null;
  if (!opts.buy) { base = swtSpin(rng, SWT.weights, new Map()); total += base.mult; }
  if (opts.buy || base!.trigger) {
    const spins: SwtSpin[] = []; let left = opts.buy ? SWT.freeSpins[3]! : base!.trigger; const spots = new Map<string, number>();
    while (left > 0 && spins.length < SWT.maxFreeSpins) {
      const s = swtSpin(rng, SWT.fsWeights, spots); spins.push(s); total += s.mult; left--;
      if (s.scatters >= 3) left += SWT.retrigger;
    }
    fs = { spins };
  }
  return { base, bought: !!opts.buy, fs, totalMult: r2(Math.min(total, SWT.maxWin)), capped: total > SWT.maxWin };
}

// ============ «Большой улов»: 5×3, 10 линий; рыбы с ценниками; бонус — рыбак собирает улов ============
export const CAT = {
  reels: 5, rows: 3, lines: ATLAS.lines,
  /** Выплата линии в «ставках на линию» за 3/4/5 (у дорогих — и за 2). */
  pays: {
    boat: { 2: 24, 3: 198, 4: 986, 5: 7394 }, rod: { 3: 123, 4: 492, 5: 2465 }, bucket: { 3: 73, 4: 297, 5: 1479 },
    lure: { 3: 49, 4: 198, 5: 740 }, fish: { 3: 24, 4: 99, 5: 492 },
    A: { 3: 24, 4: 73, 5: 297 }, K: { 3: 24, 4: 73, 5: 297 }, Q: { 3: 19, 4: 49, 5: 198 }, J: { 3: 19, 4: 49, 5: 198 }, "10": { 3: 14, 4: 40, 5: 148 },
  } as Record<string, Record<number, number>>,
  weights: { "10": 16, J: 15, Q: 14, K: 12, A: 11, fish: 10, lure: 6, bucket: 5, rod: 4, boat: 2.6, fisher: 2.2, scatter: 2.3 },
  fsWeights: { "10": 16, J: 15, Q: 14, K: 12, A: 11, fish: 13, lure: 6, bucket: 5, rod: 4, boat: 2.6, fisher: 2.2, scatter: 0 },
  /** Ценник рыбы (× общей ставки) и его вес. */
  fishValues: { 1: 400, 2: 260, 4: 150, 5: 80, 8: 50, 15: 25, 35: 8, 70: 3, 300: 0.4 } as Record<string, number>,
  scatterPays: { 3: 2, 4: 10, 5: 100 } as Record<number, number>,
  freeSpins: { 3: 10, 4: 15, 5: 20 } as Record<number, number>,
  /** Каждые 4 собранных рыбака: +10 вращений и новый множитель улова. */
  levels: [1, 2, 3, 10], perLevel: 4, levelSpins: 10, maxFreeSpins: 80, maxWin: 5000, buyPrice: 56,
};
export type Fish = { reel: number; row: number; value: number };
export type CatSpin = {
  grid: string[][]; fish: Fish[]; lines: LineWin[]; scatter: { count: number; mult: number };
  fishers: number; collected: number; level: number; mult: number; trigger: number; levelUp: boolean;
};
export type CatResult = { base: CatSpin | null; bought: boolean; fs: { spins: CatSpin[]; fishers: number } | null; totalMult: number; capped: boolean };

function catSpin(rng: Rng, fs: boolean, level: number): CatSpin {
  const grid = Array.from({ length: CAT.reels }, (_, reel) => Array.from({ length: CAT.rows }, () => {
    const w = { ...(fs ? CAT.fsWeights : CAT.weights) } as Record<string, number>;
    if (reel === 0) w.fisher = 0;               // рыбак — на барабанах 2–5
    return pick(rng, w) as string;
  }));
  const fish: Fish[] = [];
  grid.forEach((col, reel) => col.forEach((s, row) => { if (s === "fish") fish.push({ reel, row, value: Number(pick(rng, CAT.fishValues)) }); }));
  const lines = evalLines(grid, CAT.lines, CAT.pays, "fisher", 0.1);
  const n = grid.flat().filter((s) => s === "scatter").length;
  const scatter = { count: n, mult: CAT.scatterPays[Math.min(n, 5)] ?? 0 };
  const fishers = grid.flat().filter((s) => s === "fisher").length;
  // В бонусе каждый рыбак забирает ценники всех рыб на поле, умноженные на уровень
  const collected = fs && fishers ? r2(fishers * fish.reduce((s, f) => s + f.value, 0) * CAT.levels[level]!) : 0;
  const mult = r2(lines.reduce((s, w) => s + w.mult, 0) + scatter.mult + collected);
  return { grid, fish, lines, scatter, fishers, collected, level, mult, trigger: fs ? 0 : CAT.freeSpins[Math.min(n, 5)] ?? 0, levelUp: false };
}
export function playCatch(rng: Rng, opts: { buy?: boolean } = {}): CatResult {
  let total = 0; let base: CatSpin | null = null; let fs: CatResult["fs"] = null;
  if (!opts.buy) { base = catSpin(rng, false, 0); total += base.mult; }
  if (opts.buy || base!.trigger) {
    const spins: CatSpin[] = []; let left = opts.buy ? CAT.freeSpins[3]! : base!.trigger; let fishers = 0; let level = 0;
    while (left > 0 && spins.length < CAT.maxFreeSpins) {
      const s = catSpin(rng, true, level); left--;
      fishers += s.fishers;
      const nextLevel = Math.min(CAT.levels.length - 1, Math.floor(fishers / CAT.perLevel));
      if (nextLevel > level) { left += CAT.levelSpins * (nextLevel - level); level = nextLevel; s.levelUp = true; }
      spins.push(s); total += s.mult;
    }
    fs = { spins, fishers };
  }
  return { base, bought: !!opts.buy, fs, totalMult: r2(Math.min(total, CAT.maxWin)), capped: total > CAT.maxWin };
}

// ============ «Звёздные врата»: 5 барабанов, способы; бонус — ключи растят барабаны до 7 рядов ============
export const GAT = {
  reels: 5, rows: 3, maxRows: 7,
  /** Выплата за 3/4/5 барабанов подряд слева — за один способ (× общей ставки). */
  pays: {
    cat: [1.575, 4.725, 15.75], owl: [1.26, 3.15, 9.45], hat: [0.945, 2.52, 6.3], book: [0.756, 1.89, 4.725],
    potion_gold: [0.378, 0.945, 2.52], potion_red: [0.315, 0.756, 1.89], potion_green: [0.252, 0.63, 1.575], potion_blue: [0.189, 0.504, 1.26],
  } as Record<string, [number, number, number]>,
  weights: { potion_blue: 16, potion_green: 15, potion_red: 14, potion_gold: 12, book: 8, hat: 6.5, owl: 5, cat: 4, portal: 1.5, gate: 1.9, key: 0 },
  fsWeights: { potion_blue: 16, potion_green: 15, potion_red: 14, potion_gold: 12, book: 8, hat: 6.5, owl: 5, cat: 4, portal: 3, gate: 0.9, key: 9 },
  scatterPays: { 3: 2, 4: 10, 5: 50 } as Record<number, number>,
  freeSpins: 10, retrigger: 5, maxFreeSpins: 70, maxWin: 5000, buyPrice: 53,
};
export type GatWin = { sym: string; count: number; ways: number; mult: number; cells: string[] };
/** heights — высота каждого барабана в этом вращении; keys — клетки ключей (каждый ключ растит свой барабан на ряд). */
export type GatSpin = { grid: string[][]; heights: number[]; keys: string[]; wins: GatWin[]; scatter: { count: number; mult: number }; ways: number; mult: number; trigger: boolean };
export type GatResult = { base: GatSpin | null; bought: boolean; fs: { spins: GatSpin[] } | null; totalMult: number; capped: boolean };

const GWILD = "portal";
function gatEval(grid: string[][]): GatWin[] {
  const out: GatWin[] = [];
  for (const sym of Object.keys(GAT.pays)) {
    let ways = 1; let n = 0; const cells: string[] = [];
    for (let reel = 0; reel < GAT.reels; reel++) {
      let c = 0;
      grid[reel]!.forEach((s, row) => { if (s === sym || s === GWILD) { c++; cells.push(`${reel}:${row}`); } });
      if (!c) break;
      ways *= c; n++;
    }
    if (n >= 3) out.push({ sym, count: n, ways, mult: r2(GAT.pays[sym]![n - 3]! * ways), cells: cells.filter((k) => Number(k.split(":")[0]) < n) });
  }
  return out;
}
function gatSpin(rng: Rng, fs: boolean, heights: number[]): GatSpin {
  const grid = heights.map((h, reel) => Array.from({ length: h }, () => {
    const w = { ...(fs ? GAT.fsWeights : GAT.weights) } as Record<string, number>;
    if (reel === 0) w.portal = 0;               // портал-wild — на барабанах 2–5
    return pick(rng, w) as string;
  }));
  const wins = gatEval(grid);
  const keys: string[] = []; grid.forEach((col, reel) => col.forEach((s, row) => { if (s === "key") keys.push(`${reel}:${row}`); }));
  const n = grid.flat().filter((s) => s === "gate").length;
  const scatter = { count: n, mult: GAT.scatterPays[Math.min(n, 5)] ?? 0 };
  const ways = heights.reduce((p, h) => p * h, 1);
  return { grid, heights: [...heights], keys, wins, scatter, ways, mult: r2(wins.reduce((s, w) => s + w.mult, 0) + scatter.mult), trigger: n >= 3 };
}
export function playGates(rng: Rng, opts: { buy?: boolean } = {}): GatResult {
  let total = 0; let base: GatSpin | null = null; let fs: GatResult["fs"] = null;
  if (!opts.buy) { base = gatSpin(rng, false, Array(GAT.reels).fill(GAT.rows)); total += base.mult; }
  if (opts.buy || base!.trigger) {
    const spins: GatSpin[] = []; let left = GAT.freeSpins; const heights = Array(GAT.reels).fill(GAT.rows) as number[];
    while (left > 0 && spins.length < GAT.maxFreeSpins) {
      const s = gatSpin(rng, true, heights); spins.push(s); total += s.mult; left--;
      // Ключи навсегда добавляют ряд своему барабану (до 7) — со следующего вращения
      for (const k of s.keys) { const reel = Number(k.split(":")[0]); heights[reel] = Math.min(GAT.maxRows, heights[reel]! + 1); }
      if (s.scatter.count >= 3) left += GAT.retrigger;
    }
    fs = { spins };
  }
  return { base, bought: !!opts.buy, fs, totalMult: r2(Math.min(total, GAT.maxWin)), capped: total > GAT.maxWin };
}
