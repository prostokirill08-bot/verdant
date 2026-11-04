// «Emerald Cases»: 5×4, 25 линий, Дед Мороз — wild. Монеты пяти цветов летят в свои сундуки.
// Каждая монета с шансом FILL наполняет сундук до краёв — тогда он открывает свой бонус от текущей ставки.
// Поэтому сундуку может хватить и 1 монеты, а может понадобиться 30 и больше — каждый раз случайно.
// Чистые функции: одинаково работают на сервере и в браузере (проверка честности).
//
// Почему игру нельзя «обыграть» сменой ставки: шанс открыть сундук у каждой монеты одинаковый и не зависит
// от того, сколько монет уже собрано. Значит полный на вид сундук не «вот-вот откроется», и поднимать
// ставку под него бессмысленно — ожидание на рубль ставки всегда одно и то же.
import { evalLines, NEON, pick, r2, type LineWin, type Rng } from "./slots";

export const CHESTS = ["gifts", "frost", "stars", "bells", "wheel"] as const;
export type ChestKind = (typeof CHESTS)[number];
export type Meter = { have: number };   // сколько монет уже лежит в сундуке (для кристаллов на экране)

export const WS = {
  reels: 5, rows: 4,
  lines: NEON.lines,
  pays: {
    nutcracker: { 3: 28, 4: 110, 5: 560 }, globe: { 3: 15, 4: 56, 5: 235 }, cocoa: { 3: 9.4, 4: 37, 5: 140 },
    ginger: { 3: 5.6, 4: 22, 5: 85 }, mitten: { 3: 3.75, 4: 14, 5: 56 }, cane: { 3: 3.75, 4: 14, 5: 56 },
  } as Record<string, Record<number, number>>,
  weights: { cane: 16, mitten: 16, ginger: 13, cocoa: 10, globe: 7, nutcracker: 3.6, santa: 2.0, coin: 0 },
  /** Вероятность, что в клетке окажется монета (вместо обычного символа). */
  coinChance: 0.00865,
  /** Шанс, что монета наполнит сундук (одинаковый для каждой монеты). В среднем сундуку нужно 10 монет. */
  fillChance: 0.1,
  /** Сколько монет рисуется как «полный» сундук на экране. */
  visualMax: 30,
  maxFeature: 2000,                 // потолок множителя одного бонуса (от ставки)
  // Бонусы
  pickTable: { 1: 20, 2: 20, 3: 15, 5: 15, 8: 10, 10: 8, 15: 6, 25: 3, 50: 2, 100: 1 } as Record<string, number>,
  pickBoxes: 12, pickCount: 3,
  frostSpins: 10, starSpins: 10,
  bellValues: { 1: 40, 2: 28, 3: 13, 5: 9, 10: 5, 15: 2.5, 25: 1.5, 50: 0.7, 100: 0.3 } as Record<string, number>,
  bellChance: 0.05, bellRespins: 3, bellGrand: 200,
  wheel: [5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100, 250],
  wheelWeights: [14, 14, 13, 12, 11, 9, 8, 7, 5, 4, 2, 1],
};
export const CHEST_NAMES: Record<ChestKind, string> = { gifts: "Подарки", frost: "Мороз", stars: "Звездопад", bells: "Колокольчики", wheel: "Колесо" };

export type WsCell = { sym: string; chest?: number };
export type WsSpin = { grid: WsCell[][]; wins: LineWin[]; mult: number };
export type WsCoin = { reel: number; row: number; chest: number; fills: boolean };
export type WsFeature =
  | { kind: "gifts"; boxes: number[]; picks: number }
  | { kind: "frost"; spins: (WsSpin & { sticky: string[] })[] }
  | { kind: "stars"; spins: (WsSpin & { x: number })[] }
  | { kind: "bells"; steps: { cells: Record<string, number>; respins: number }[]; full: boolean }
  | { kind: "wheel"; segment: number };
export type WsTrigger = { chest: number; kind: ChestKind; coins: number; stake: number; feature: WsFeature; mult: number; payout: number };
export type WsResult = { bet: number; before: Meter[]; base: WsSpin; coins: WsCoin[]; triggers: WsTrigger[]; after: Meter[]; baseWin: number; total: number; totalMult: number };

export const emptyMeters = (): Meter[] => CHESTS.map(() => ({ have: 0 }));
const units = (stake: number, m: number) => Math.floor((stake * Math.round(m * 10000)) / 10000);

function grid(rng: Rng, coins: boolean, sticky?: Set<string>): WsCell[][] {
  return Array.from({ length: WS.reels }, (_, reel) => Array.from({ length: WS.rows }, (_, row) => {
    if (sticky?.has(`${reel}:${row}`)) { rng(); return { sym: "santa" }; }   // число всё равно расходуется — поток не сдвигается
    if (coins && rng() < WS.coinChance) return { sym: "coin", chest: Math.floor(rng() * CHESTS.length) };
    const w = { ...WS.weights } as Record<string, number>;
    if (reel === 0 || reel === 4) w.santa = 0;           // Дед Мороз только на барабанах 2–4
    return { sym: pick(rng, w) };
  }));
}
function lineWins(g: WsCell[][], x = 1): { wins: LineWin[]; mult: number } {
  const wins = evalLines(g.map((c) => c.map((v) => v.sym)), WS.lines, WS.pays, "santa", 1 / WS.lines.length).map((w) => ({ ...w, mult: r2(w.mult * x) }));
  return { wins, mult: r2(wins.reduce((s, w) => s + w.mult, 0)) };
}

export function playFeature(rng: Rng, kind: ChestKind): { feature: WsFeature; mult: number } {
  switch (kind) {
    case "gifts": {
      // 12 подарков: игрок открывает 3. Значения выпадают по порядку открытия, остальные показываются после.
      const boxes = Array.from({ length: WS.pickBoxes }, () => Number(pick(rng, WS.pickTable)));
      return { feature: { kind, boxes, picks: WS.pickCount }, mult: boxes.slice(0, WS.pickCount).reduce((s, v) => s + v, 0) };
    }
    case "frost": {
      // Морозные вращения: каждый Дед Мороз примерзает к месту до конца бонуса
      const sticky = new Set<string>(); const spins: (WsSpin & { sticky: string[] })[] = []; let m = 0;
      for (let i = 0; i < WS.frostSpins; i++) {
        const g = grid(rng, false, sticky);
        g.forEach((col, reel) => col.forEach((c, row) => c.sym === "santa" && sticky.add(`${reel}:${row}`)));
        const lw = lineWins(g); m += lw.mult;
        spins.push({ grid: g, ...lw, sticky: [...sticky] });
      }
      return { feature: { kind, spins }, mult: r2(m) };
    }
    case "stars": {
      // Звездопад: множитель растёт на +1 после каждого выигрышного вращения
      let x = 1; let m = 0; const spins: (WsSpin & { x: number })[] = [];
      for (let i = 0; i < WS.starSpins; i++) {
        const g = grid(rng, false); const lw = lineWins(g, x); m += lw.mult;
        spins.push({ grid: g, ...lw, x });
        if (lw.mult > 0) x++;
      }
      return { feature: { kind, spins }, mult: r2(m) };
    }
    case "bells": {
      // Колокольчики: 3–5 колокольчиков с номиналами, 3 перекрута; новый колокольчик возвращает перекруты к 3
      const cells: Record<string, number> = {}; const total = WS.reels * WS.rows;
      const start = 3 + Math.floor(rng() * 3);
      while (Object.keys(cells).length < start) { const p = Math.floor(rng() * total); const key = `${Math.floor(p / WS.rows)}:${p % WS.rows}`; if (!(key in cells)) cells[key] = Number(pick(rng, WS.bellValues)); }
      const steps = [{ cells: { ...cells }, respins: WS.bellRespins }];
      let left = WS.bellRespins;
      while (left > 0 && Object.keys(cells).length < total) {
        left--; let got = false;
        for (let reel = 0; reel < WS.reels; reel++) for (let row = 0; row < WS.rows; row++) {
          const key = `${reel}:${row}`; if (key in cells) continue;
          if (rng() < WS.bellChance) { cells[key] = Number(pick(rng, WS.bellValues)); got = true; }
        }
        if (got) left = WS.bellRespins;
        steps.push({ cells: { ...cells }, respins: left });
      }
      const full = Object.keys(cells).length === total;
      return { feature: { kind, steps, full }, mult: Object.values(cells).reduce((s, v) => s + v, 0) + (full ? WS.bellGrand : 0) };
    }
    case "wheel": {
      const total = WS.wheelWeights.reduce((s, w) => s + w, 0); let x = rng() * total; let segment = WS.wheel.length - 1;
      for (let i = 0; i < WS.wheelWeights.length; i++) { if ((x -= WS.wheelWeights[i]!) < 0) { segment = i; break; } }
      return { feature: { kind, segment }, mult: WS.wheel[segment]! };
    }
  }
}

/** Один спин: состояние сундуков до → линии, монеты, бонусы наполнившихся сундуков → состояние после. bet — ставка в копейках. */
export function playWorkshop(rng: Rng, before: Meter[], bet: number): WsResult {
  const meters = before.map((m) => ({ ...m }));
  const g = grid(rng, true);
  const base: WsSpin = { grid: g, ...lineWins(g) };
  const coins: WsCoin[] = []; const pending: { chest: number; coins: number }[] = [];
  g.forEach((col, reel) => col.forEach((c, row) => {
    if (c.sym !== "coin") return;
    const chest = c.chest!; const m = meters[chest]!;
    m.have++;
    const fills = rng() < WS.fillChance;           // одинаковый шанс у каждой монеты — сундук «не помнит» прошлых
    coins.push({ reel, row, chest, fills });
    if (fills) { pending.push({ chest, coins: m.have }); m.have = 0; }
  }));
  const triggers: WsTrigger[] = pending.map((p) => {
    const kind = CHESTS[p.chest]!; const { feature, mult } = playFeature(rng, kind);
    const capped = Math.min(mult, WS.maxFeature);
    return { ...p, kind, stake: bet, feature, mult: r2(capped), payout: units(bet, capped) };
  });
  const baseWin = units(bet, base.mult);
  const total = baseWin + triggers.reduce((s, t) => s + t.payout, 0);
  return { bet, before, base, coins, triggers, after: meters, baseWin, total, totalMult: r2(total / bet) };
}

/** Компактная строка состояния сундуков «3|0|12|…» — хранится в параметрах раунда для проверки честности. */
export const encodeMeters = (m: Meter[]) => m.map((x) => String(x.have)).join("|");
export function decodeMeters(s: unknown): Meter[] {
  const out = emptyMeters();
  if (typeof s !== "string") return out;
  s.split("|").slice(0, CHESTS.length).forEach((part, i) => {
    const have = Number(part.split(".")[0]);
    if (Number.isInteger(have) && have >= 0 && have < 100000) out[i] = { have };
  });
  return out;
}
/** Публичный вид сундука: сколько монет собрано. */
export const meterView = (m: Meter[]) => m.map((x, i) => ({ kind: CHESTS[i]!, have: x.have }));
