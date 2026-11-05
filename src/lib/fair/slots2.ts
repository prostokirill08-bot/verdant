// Слоты второй волны: «Лавина», «Салют», «Хрустальный шар».
// Чистые функции от потока случайных чисел [0, 1) — одинаково на сервере и в браузере (страница «Честность»).
// Все выплаты — в долях общей ставки.
import { evalLines, pick, r2, type LineWin, type Rng } from "./slots";

// ============ «Лавина»: 6×5, выигрыш 8+ одинаковых где угодно, каскады; бонус — растущий множитель ============
export const AVA = {
  reels: 6, rows: 5,
  low: ["ice_blue", "ice_green", "ice_purple", "ice_pink"], high: ["penguin", "fox", "owl", "bear"],
  /** Выплата за 8–9 / 10–11 / 12+ символов (× общей ставки). */
  pays: {
    bear: [8, 20, 40], owl: [2, 8, 20], fox: [1.6, 4, 12], penguin: [1.2, 1.6, 10],
    ice_pink: [0.8, 1.2, 8], ice_purple: [0.6, 1, 6], ice_green: [0.4, 0.8, 4], ice_blue: [0.2, 0.6, 1.6],
  } as Record<string, [number, number, number]>,
  weights: { ice_blue: 20, ice_green: 18, ice_purple: 16, ice_pink: 14, penguin: 11, fox: 9, owl: 7, bear: 5, snowflake: 2.25 },
  fsWeights: { ice_blue: 24, ice_green: 20, ice_purple: 17, ice_pink: 14, penguin: 10, fox: 8, owl: 6, bear: 4, snowflake: 1.6 },
  /** Снежинки (× общей ставки) — 4+ запускают бонус. */
  scatterPays: { 4: 3, 5: 5, 6: 100 } as Record<number, number>,
  freeSpins: 10, retrigger: 5, maxFreeSpins: 60, maxWin: 5000, buyPrice: 100,
};
export type AvaWin = { sym: string; count: number; mult: number; cells: string[] };
/** Один шаг каскада: поле до удаления, выигрыши, множитель лавины на этом шаге. */
export type AvaStep = { grid: string[][]; wins: AvaWin[]; mult: number; x: number };
export type AvaSpin = { steps: AvaStep[]; scatter: { count: number; mult: number }; mult: number; trigger: boolean; xAfter: number };
export type AvaResult = { base: AvaSpin | null; bought: boolean; fs: { spins: AvaSpin[] } | null; totalMult: number; capped: boolean };

const avaTier = (n: number) => (n >= 12 ? 2 : n >= 10 ? 1 : 0);
function avaEval(grid: string[][]): AvaWin[] {
  const cells = new Map<string, string[]>();
  grid.forEach((col, r) => col.forEach((s, row) => { if (AVA.pays[s]) cells.set(s, [...(cells.get(s) ?? []), `${r}:${row}`]); }));
  const out: AvaWin[] = [];
  for (const [sym, list] of cells) if (list.length >= 8) out.push({ sym, count: list.length, mult: AVA.pays[sym]![avaTier(list.length)]!, cells: list });
  return out;
}
/**
 * Вращение с каскадами. x — множитель лавины перед вращением (в бонусе он копится между вращениями),
 * grow — растёт ли множитель: каждый выигрышный обвал +1.
 */
function avaSpin(rng: Rng, weights: Record<string, number>, x: number, grow: boolean): AvaSpin {
  let grid = Array.from({ length: AVA.reels }, () => Array.from({ length: AVA.rows }, () => pick(rng, weights) as string));
  const scatterCount = grid.flat().filter((s) => s === "snowflake").length;
  const steps: AvaStep[] = []; let total = 0;
  for (let guard = 0; guard < 40; guard++) {
    const wins = avaEval(grid);
    const sum = wins.reduce((s, w) => s + w.mult, 0);
    steps.push({ grid, wins, mult: r2(sum * x), x });
    if (!wins.length) break;
    total += sum * x;
    if (grow) x += 1;
    // Выигрышные символы раскалываются, остальные падают вниз, сверху досыпаются новые
    const gone = new Set(wins.flatMap((w) => w.cells));
    grid = grid.map((col, r) => {
      const keep = col.filter((_, row) => !gone.has(`${r}:${row}`));
      const fresh = Array.from({ length: AVA.rows - keep.length }, () => pick(rng, { ...weights, snowflake: 0 }) as string);
      return [...fresh, ...keep];
    });
  }
  const scatter = { count: scatterCount, mult: AVA.scatterPays[Math.min(scatterCount, 6)] ?? 0 };
  return { steps, scatter, mult: r2(total + scatter.mult), trigger: scatterCount >= 4, xAfter: x };
}
export function playAvalanche(rng: Rng, opts: { buy?: boolean } = {}): AvaResult {
  let total = 0; let base: AvaSpin | null = null; let fs: AvaResult["fs"] = null;
  if (!opts.buy) { base = avaSpin(rng, AVA.weights, 1, false); total += base.mult; }
  if (opts.buy || base!.trigger) {
    const spins: AvaSpin[] = []; let left = AVA.freeSpins; let x = 1;
    while (left > 0 && spins.length < AVA.maxFreeSpins) {
      const s = avaSpin(rng, AVA.fsWeights, x, true); spins.push(s); total += s.mult; x = s.xAfter; left--;
      if (s.scatter.count >= 3) left += AVA.retrigger;
    }
    fs = { spins };
  }
  return { base, bought: !!opts.buy, fs, totalMult: r2(Math.min(total, AVA.maxWin)), capped: total > AVA.maxWin };
}

// ============ «Салют»: 5×4, 1024 способа; ракеты-wild с множителями; бонус — ходячие ракеты ============
export const SAL = {
  reels: 5, rows: 4,
  /** Выплата за 3/4/5 подряд с левого барабана — за один «способ» (× общей ставки). */
  pays: {
    deer: [0.1, 0.3, 1], snowman: [0.08, 0.2, 0.6], lantern: [0.05, 0.12, 0.3], bell: [0.04, 0.1, 0.25], popper: [0.025, 0.06, 0.16], tangerine: [0.02, 0.05, 0.12],
  } as Record<string, [number, number, number]>,
  weights: { tangerine: 15, popper: 14, bell: 12, lantern: 11, snowman: 6, deer: 4.6, rocket: 1.6, firebox: 1.16 },
  fsWeights: { tangerine: 15, popper: 14, bell: 12, lantern: 11, snowman: 6, deer: 4.6, rocket: 2.45, firebox: 1.2 },
  rocketMult: { 1: 72, 2: 21, 3: 7 } as Record<string, number>,
  fsRocketMult: { 2: 52, 3: 30, 5: 15, 10: 3 } as Record<string, number>,
  scatterPays: { 3: 2, 4: 10, 5: 50 } as Record<number, number>,
  freeSpins: 8, retrigger: 4, maxFreeSpins: 60, maxWin: 5000, buyPrice: 66,
};
export type Rocket = { reel: number; row: number; x: number; id: number };
export type SalWin = { sym: string; count: number; ways: number; mult: number; cells: string[] };
/** wild — все ракеты на поле в этом вращении (новые и «шагающие»); burst — ракеты, улетевшие за верхний край. */
export type SalSpin = { grid: string[][]; rockets: Rocket[]; burst: Rocket[]; wins: SalWin[]; scatter: { count: number; mult: number }; mult: number; trigger: boolean };
export type SalResult = { base: SalSpin | null; bought: boolean; fs: { spins: SalSpin[] } | null; totalMult: number; capped: boolean };

const WILD = "rocket";
/** Способы: на каждом барабане слева — клетки символа или ракеты; вес клетки = 1 (символ) или множитель ракеты. */
function salEval(grid: string[][], rockets: Rocket[]): SalWin[] {
  const xAt = new Map(rockets.map((r) => [`${r.reel}:${r.row}`, r.x]));
  const out: SalWin[] = [];
  for (const sym of Object.keys(SAL.pays)) {
    let weight = 1; let ways = 1; let n = 0; const cells: string[] = [];
    for (let reel = 0; reel < SAL.reels; reel++) {
      let w = 0; let c = 0;
      grid[reel]!.forEach((s, row) => { const k = `${reel}:${row}`; if (s === sym) { w += 1; c++; cells.push(k); } else if (s === WILD) { w += xAt.get(k) ?? 1; c++; cells.push(k); } });
      if (!c) break;
      weight *= w; ways *= c; n++;
    }
    if (n >= 3) {
      const keep = cells.filter((k) => Number(k.split(":")[0]) < n);
      out.push({ sym, count: n, ways, mult: r2(SAL.pays[sym]![n - 3]! * weight), cells: keep });
    }
  }
  return out;
}
let rocketSeq = 0;
function salSpin(rng: Rng, fs: boolean, walking: Rocket[]): SalSpin {
  const grid = Array.from({ length: SAL.reels }, (_, reel) => Array.from({ length: SAL.rows }, () => {
    const w = { ...(fs ? SAL.fsWeights : SAL.weights) } as Record<string, number>;
    if (reel === 0) w.rocket = 0;                  // ракеты — на барабанах 2–5
    return pick(rng, w) as string;
  }));
  // Новые ракеты получают множитель; в бонусе к ним добавляются «шагающие» с прошлых вращений
  const fresh: Rocket[] = [];
  grid.forEach((col, reel) => col.forEach((s, row) => { if (s === WILD) fresh.push({ reel, row, x: Number(pick(rng, fs ? SAL.fsRocketMult : SAL.rocketMult)), id: ++rocketSeq }); }));
  const occupied = new Set(walking.map((r) => `${r.reel}:${r.row}`));
  const rockets = [...walking, ...fresh.filter((r) => !occupied.has(`${r.reel}:${r.row}`))];
  for (const r of rockets) grid[r.reel]![r.row] = WILD;
  const wins = salEval(grid, rockets);
  const n = grid.flat().filter((s) => s === "firebox").length;
  const scatter = { count: n, mult: SAL.scatterPays[Math.min(n, 5)] ?? 0 };
  return { grid, rockets, burst: [], wins, scatter, mult: r2(wins.reduce((s, w) => s + w.mult, 0) + scatter.mult), trigger: n >= 3 };
}
export function playSalute(rng: Rng, opts: { buy?: boolean } = {}): SalResult {
  rocketSeq = 0;
  let total = 0; let base: SalSpin | null = null; let fs: SalResult["fs"] = null;
  if (!opts.buy) { base = salSpin(rng, false, []); total += base.mult; }
  if (opts.buy || base!.trigger) {
    const spins: SalSpin[] = []; let left = SAL.freeSpins; let walking: Rocket[] = [];
    while (left > 0 && spins.length < SAL.maxFreeSpins) {
      // Ракеты поднимаются на ряд вверх; улетевшие за край взрываются салютом
      const moved = walking.map((r) => ({ ...r, row: r.row - 1 }));
      const burst = moved.filter((r) => r.row < 0);
      const s = salSpin(rng, true, moved.filter((r) => r.row >= 0));
      s.burst = burst;
      spins.push(s); total += s.mult; left--;
      walking = s.rockets;
      if (s.trigger) left += SAL.retrigger;
    }
    fs = { spins };
  }
  return { base, bought: !!opts.buy, fs, totalMult: r2(Math.min(total, SAL.maxWin)), capped: total > SAL.maxWin };
}

// ============ «Хрустальный шар»: 5×3, 10 линий; шары-загадки; бонус — липкие шары с улучшением символа ============
export const CRY = {
  reels: 5, rows: 3,
  lines: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 2, 1, 0, 1]],
  /** Лестница улучшений в бонусе: от дешёвого к дорогому. */
  ladder: ["bauble_blue", "bauble_green", "bauble_red", "bauble_gold", "key", "troika", "castle"],
  pays: {
    castle: { 3: 65, 4: 330, 5: 1300 }, troika: { 3: 40, 4: 160, 5: 650 }, key: { 3: 26, 4: 105, 5: 400 },
    bauble_gold: { 3: 13, 4: 52, 5: 200 }, bauble_red: { 3: 10, 4: 40, 5: 130 }, bauble_green: { 3: 7, 4: 26, 5: 105 }, bauble_blue: { 3: 7, 4: 19, 5: 80 },
  } as Record<string, Record<number, number>>,
  weights: { bauble_blue: 18, bauble_green: 17, bauble_red: 15, bauble_gold: 13, key: 8, troika: 5, castle: 3, orb: 5, star: 2.2 },
  fsWeights: { bauble_blue: 18, bauble_green: 17, bauble_red: 15, bauble_gold: 13, key: 8, troika: 5, castle: 3, orb: 3.7, star: 1.5 },
  /** Во что раскрываются шары в обычной игре. */
  reveal: { bauble_blue: 20, bauble_green: 18, bauble_red: 16, bauble_gold: 14, key: 9, troika: 5, castle: 3 },
  scatterPays: { 3: 2, 4: 10, 5: 50 } as Record<number, number>,
  freeSpins: 10, retrigger: 5, maxFreeSpins: 60, maxWin: 5000, buyPrice: 58,
};
export type CrySpin = { grid: string[][]; orbs: string[]; sticky: string[]; reveal: string | null; revealed: string[][]; wins: LineWin[]; scatter: { count: number; mult: number }; mult: number; trigger: boolean; level: number };
export type CryResult = { base: CrySpin | null; bought: boolean; fs: { spins: CrySpin[] } | null; totalMult: number; capped: boolean };

function crySpin(rng: Rng, fs: boolean, sticky: Set<string>, level: number): CrySpin {
  const grid = Array.from({ length: CRY.reels }, () => Array.from({ length: CRY.rows }, () => pick(rng, fs ? CRY.fsWeights : CRY.weights) as string));
  for (const k of sticky) { const [r, row] = k.split(":").map(Number); grid[r!]![row!] = "orb"; }
  const orbs: string[] = [];
  grid.forEach((col, r) => col.forEach((s, row) => { if (s === "orb") orbs.push(`${r}:${row}`); }));
  // Все шары раскрываются в один символ: в обычной игре — случайный, в бонусе — текущая ступень лестницы
  const reveal = orbs.length ? (fs ? CRY.ladder[Math.min(level, CRY.ladder.length - 1)]! : (pick(rng, CRY.reveal) as string)) : null;
  const revealed = grid.map((col) => col.map((s) => (s === "orb" ? reveal! : s)));
  const wins = evalLines(revealed, CRY.lines, CRY.pays, "__none__", 1 / CRY.lines.length);
  const n = grid.flat().filter((s) => s === "star").length;
  const scatter = { count: n, mult: CRY.scatterPays[Math.min(n, 5)] ?? 0 };
  return { grid, orbs, sticky: [...sticky], reveal, revealed, wins, scatter, mult: r2(wins.reduce((s, w) => s + w.mult, 0) + scatter.mult), trigger: n >= 3, level };
}
export function playCrystal(rng: Rng, opts: { buy?: boolean } = {}): CryResult {
  let total = 0; let base: CrySpin | null = null; let fs: CryResult["fs"] = null;
  if (!opts.buy) { base = crySpin(rng, false, new Set(), 0); total += base.mult; }
  if (opts.buy || base!.trigger) {
    const spins: CrySpin[] = []; let left = CRY.freeSpins; const sticky = new Set<string>(); let level = 0;
    while (left > 0 && spins.length < CRY.maxFreeSpins) {
      const s = crySpin(rng, true, sticky, level); spins.push(s); total += s.mult; left--;
      for (const k of s.orbs) sticky.add(k);          // шары прилипают до конца бонуса
      level++;                                         // символ внутри шаров улучшается на ступень
      if (s.trigger) left += CRY.retrigger;
    }
    fs = { spins };
  }
  return { base, bought: !!opts.buy, fs, totalMult: r2(Math.min(total, CRY.maxWin)), capped: total > CRY.maxWin };
}
