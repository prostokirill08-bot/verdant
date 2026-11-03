// Каталог игр: категория, обложка, цвет темы. Настройки (лимиты, вкл/выкл) — в БД.
export const GAME_SLUGS = ["atlas", "neon-garden", "crash", "mines", "dice", "plinko", "limbo", "roulette"] as const;
export type GameSlug = (typeof GAME_SLUGS)[number];
export type GameCategory = "slots" | "originals";

export type GameMeta = {
  name: string; category: GameCategory; cover: string; bg?: string;
  /** Два цвета темы: свечение и градиенты на странице игры и в карточке. */
  theme: [string, string]; badge?: "Новинка" | "Хит"; blurb: string;
};

export const GAMES: Record<GameSlug, GameMeta> = {
  atlas: { name: "Атлас звёзд", category: "slots", cover: "/img/covers/atlas.webp", bg: "/img/bg/atlas.webp", theme: ["#7c5cff", "#2fb8ff"], badge: "Новинка", blurb: "Книжный слот 5×3: особый символ раскрывается на весь барабан" },
  "neon-garden": { name: "Неоновый сад", category: "slots", cover: "/img/covers/neon-garden.webp", bg: "/img/bg/neon-garden.webp", theme: ["#ff3ea5", "#3ef08e"], badge: "Новинка", blurb: "Фруктовый слот 5×4 с пятью бонусами и джекпотом" },
  crash: { name: "Crash", category: "originals", cover: "/img/covers/crash.webp", theme: ["#ff8a3d", "#22d3ee"], badge: "Хит", blurb: "Ракета летит — забери до взрыва" },
  mines: { name: "Mines", category: "originals", cover: "/img/covers/mines.webp", theme: ["#22c55e", "#ff4d6d"], blurb: "Ищи кристаллы, обходи бомбы" },
  dice: { name: "Dice", category: "originals", cover: "/img/covers/dice.webp", theme: ["#a855f7", "#22d3ee"], blurb: "Выбери шанс и брось кости" },
  plinko: { name: "Plinko", category: "originals", cover: "/img/covers/plinko.webp", theme: ["#ec4899", "#8b5cf6"], blurb: "Шарик скачет по штырькам" },
  limbo: { name: "Limbo", category: "originals", cover: "/img/covers/limbo.webp", theme: ["#fbbf24", "#8b5cf6"], blurb: "Задай цель — множитель решит" },
  roulette: { name: "Roulette", category: "originals", cover: "/img/covers/roulette.webp", theme: ["#ef4444", "#16a34a"], blurb: "Европейская рулетка на 37 секторов" },
};
export const GAME_NAMES = Object.fromEntries(GAME_SLUGS.map((s) => [s, GAMES[s].name])) as Record<GameSlug, string>;
export const CATEGORY_NAMES: Record<GameCategory, string> = { slots: "Слоты", originals: "Оригинальные игры" };
export const isGameSlug = (s: string): s is GameSlug => (GAME_SLUGS as readonly string[]).includes(s);
