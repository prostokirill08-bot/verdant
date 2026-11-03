// Пять новых игр: Монетка, Колесо, Кено, Башня, Hi-Lo. Чистые функции «числа из HMAC → результат»,
// общие для сервера и страницы проверки честности.

const floor4 = (x: number) => Math.floor(x * 10000 + 1e-9) / 10000;

// ---------- Монетка: серия из N бросков, все должны совпасть с выбранной стороной ----------
export const COIN_MAX_FLIPS = 10;
export const coinSides = (fs: number[], flips: number) => fs.slice(0, flips).map((f) => (f < 0.5 ? "heads" : "tails") as "heads" | "tails");
export const coinMultiplier = (flips: number, edgeBp: number) => floor4(2 ** flips * (1 - edgeBp / 10000));

// ---------- Колесо: 20 секторов, три уровня риска, RTP 99% ----------
export const WHEEL_RISKS = ["low", "medium", "high"] as const;
export type WheelRisk = (typeof WHEEL_RISKS)[number];
export const WHEEL: Record<WheelRisk, number[]> = {
  low: [1.2, 1.5, 1.2, 0, 1.2, 1.2, 1.5, 1.2, 0, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2],
  medium: [0, 1.5, 0, 2, 0, 3, 0, 1.5, 0, 2, 0, 1.8, 0, 1.5, 0, 3, 0, 2, 0, 1.5],
  high: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 19.8, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
export const wheelSegment = (f: number) => Math.floor(f * 20);

// ---------- Кено: 40 чисел, игрок выбирает 1–10, выпадает 10. Таблицы — RTP ≈ 96–97,5% ----------
export const KENO_TOTAL = 40, KENO_DRAW = 10;
export const KENO_PAYS: Record<number, number[]> = {
  1: [0, 3.9], 2: [0, 1.82, 4.74], 3: [0, 0, 5.79, 15], 4: [0, 0, 2.93, 7.63, 19], 5: [0, 0, 0, 9.12, 23, 61],
  6: [0, 0, 0, 4.8, 12, 32, 84], 7: [0, 0, 0, 2.85, 7.42, 19, 50, 130], 8: [0, 0, 0, 0, 8.24, 21, 55, 140, 370],
  9: [0, 0, 0, 0, 4.88, 12, 32, 85, 220, 570], 10: [0, 0, 0, 0, 3.1, 8.06, 20, 54, 140, 360, 950],
};
/** 10 разных чисел из 1..40: частичное тасование Фишера — Йетса. */
export function kenoDraw(fs: number[]): number[] {
  const pool = Array.from({ length: KENO_TOTAL }, (_, i) => i + 1);
  for (let i = 0; i < KENO_DRAW; i++) { const j = i + Math.floor(fs[i]! * (KENO_TOTAL - i)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  return pool.slice(0, KENO_DRAW);
}

// ---------- Башня: 8 этажей, на каждом выбираешь клетку, ловушки скрыты ----------
export const TOWER_FLOORS = 8;
export const TOWER_LEVELS = { easy: { tiles: 4, traps: 1, name: "Лёгкая" }, medium: { tiles: 3, traps: 1, name: "Средняя" }, hard: { tiles: 2, traps: 1, name: "Сложная" }, expert: { tiles: 3, traps: 2, name: "Эксперт" } } as const;
export type TowerLevel = keyof typeof TOWER_LEVELS;
export const TOWER_FLOATS = TOWER_FLOORS * 3;
/** Ловушки на каждом этаже: тасование клеток этажа, первые traps — ловушки. 3 числа на этаж. */
export function towerLayout(fs: number[], level: TowerLevel): number[][] {
  const { tiles, traps } = TOWER_LEVELS[level];
  return Array.from({ length: TOWER_FLOORS }, (_, floor) => {
    const t = Array.from({ length: tiles }, (_, i) => i);
    for (let i = 0; i < tiles - 1; i++) { const j = i + Math.floor(fs[floor * 3 + i]! * (tiles - i)); [t[i], t[j]] = [t[j]!, t[i]!]; }
    return t.slice(0, traps).sort((a, b) => a - b);
  });
}
export function towerMultiplier(level: TowerLevel, floors: number, edgeBp: number) {
  if (floors === 0) return 1;
  const { tiles, traps } = TOWER_LEVELS[level];
  return floor4((tiles / (tiles - traps)) ** floors * (1 - edgeBp / 10000));
}

// ---------- Hi-Lo: бесконечная колода, угадай — следующая карта выше/ниже ----------
export const HILO_MAX_CARDS = 60;
/** Карта: ранг 1 (туз) … 13 (король) и масть 0–3. */
export const hiloCard = (f: number) => { const n = Math.floor(f * 52); return { rank: (n % 13) + 1, suit: Math.floor(n / 13) }; };
/** Вероятности для текущего ранга: «выше или равно» и «ниже или равно». На тузе «ниже» = только туз, на короле «выше» = только король. */
export function hiloOdds(rank: number) {
  return { higher: (14 - rank) / 13, lower: rank / 13 };
}
export const hiloStepMult = (p: number, edgeBp: number) => (1 - edgeBp / 10000) / p;
export const RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
