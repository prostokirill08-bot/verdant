// Каталог игр: категория, фирменная обложка, цвет темы. Настройки (лимиты, вкл/выкл) — в БД.
export const GAME_SLUGS = ["avalanche", "salute", "crystal", "workshop", "atlas", "neon-garden", "blackjack", "videopoker", "baccarat", "sledrace", "crash", "mines", "tower", "hilo", "wheel", "keno", "coinflip", "dice", "plinko", "limbo", "roulette"] as const;
export type GameSlug = (typeof GAME_SLUGS)[number];
export type GameCategory = "slots" | "originals" | "table";

export type GameMeta = {
  name: string; category: GameCategory; cover: string; bg?: string;
  /** Два цвета темы: свечение и градиенты на странице игры и в карточке. */
  theme: [string, string]; badge?: "Новинка" | "Хит"; blurb: string;
};

export const GAMES: Record<GameSlug, GameMeta> = {
  avalanche: { name: "Avalanche", category: "slots", cover: "/img/verdant/games/avalanche.webp", theme: ["#35e889", "#087c4b"], badge: "Новинка", blurb: "Собирай комбинации и открывай каскадные множители" },
  salute: { name: "Neon Burst", category: "slots", cover: "/img/verdant/games/salute.webp", theme: ["#42f59b", "#087c4b"], badge: "Новинка", blurb: "Яркие символы, бонусные раунды и крупные комбинации" },
  crystal: { name: "Crystal Vault", category: "slots", cover: "/img/verdant/games/crystal.webp", theme: ["#59f0ad", "#126b4c"], badge: "Новинка", blurb: "Открой кристальные символы и собери выигрышную линию" },
  workshop: { name: "Emerald Cases", category: "slots", cover: "/img/verdant/games/workshop.webp", theme: ["#42e889", "#126b3d"], badge: "Новинка", blurb: "Серия сундуков с разными наградами и бонусами" },
  atlas: { name: "Atlas of Stars", category: "slots", cover: "/img/verdant/games/atlas.webp", theme: ["#5ce8a1", "#0b704b"], badge: "Новинка", blurb: "Исследуй символы и активируй расширяющиеся wild-барабаны" },
  "neon-garden": { name: "Neon Garden", category: "slots", cover: "/img/verdant/games/neon-garden.webp", theme: ["#38e88d", "#0a7549"], badge: "Новинка", blurb: "Неоновые символы и бонусные бесплатные вращения" },
  blackjack: { name: "Blackjack", category: "table", cover: "/img/verdant/games/blackjack.webp", theme: ["#35e889", "#087c4b"], blurb: "Набери 21 раньше дилера: удвоение, сплит, блэкджек 3:2" },
  videopoker: { name: "Video Poker", category: "table", cover: "/img/verdant/games/videopoker.webp", theme: ["#35e889", "#087c4b"], blurb: "Собери сильную комбинацию из пяти карт" },
  baccarat: { name: "Baccarat", category: "table", cover: "/img/verdant/games/baccarat.webp", theme: ["#35e889", "#087c4b"], blurb: "Игрок, банкир или ничья — кто ближе к девяти" },
  sledrace: { name: "Race", category: "originals", cover: "/img/verdant/games/sledrace.webp", theme: ["#35e889", "#087c4b"], blurb: "Выбери участника и следи за гонкой до финиша" },
  crash: { name: "Crash", category: "originals", cover: "/img/verdant/games/crash.webp", theme: ["#35e889", "#087c4b"], badge: "Хит", blurb: "Следи за ростом множителя и забирай вовремя" },
  mines: { name: "Mines", category: "originals", cover: "/img/verdant/games/mines.webp", theme: ["#35e889", "#087c4b"], blurb: "Открывай безопасные клетки и обходи мины" },
  dice: { name: "Dice", category: "originals", cover: "/img/verdant/games/dice.webp", theme: ["#35e889", "#087c4b"], blurb: "Выбери вероятность и брось кости" },
  plinko: { name: "Plinko", category: "originals", cover: "/img/verdant/games/plinko.webp", theme: ["#35e889", "#087c4b"], blurb: "Запусти шар сквозь поле множителей" },
  limbo: { name: "Limbo", category: "originals", cover: "/img/verdant/games/limbo.webp", theme: ["#35e889", "#087c4b"], blurb: "Проверь, достигнет ли раунд заданного множителя" },
  tower: { name: "Tower", category: "originals", cover: "/img/verdant/games/tower.webp", theme: ["#35e889", "#087c4b"], badge: "Новинка", blurb: "Поднимайся по уровням и выбирай момент остановки" },
  hilo: { name: "Hi-Lo", category: "table", cover: "/img/verdant/games/hilo.webp", theme: ["#35e889", "#087c4b"], badge: "Новинка", blurb: "Угадай, будет следующая карта выше или ниже" },
  wheel: { name: "Wheel", category: "originals", cover: "/img/verdant/games/wheel.webp", theme: ["#35e889", "#087c4b"], badge: "Новинка", blurb: "Запусти колесо и поймай нужный сектор" },
  keno: { name: "Keno", category: "originals", cover: "/img/verdant/games/keno.webp", theme: ["#35e889", "#087c4b"], badge: "Новинка", blurb: "Выбери числа и проверь совпадения" },
  coinflip: { name: "Coinflip", category: "originals", cover: "/img/verdant/games/coinflip.webp", theme: ["#35e889", "#087c4b"], badge: "Новинка", blurb: "Выбери сторону монеты" },
  roulette: { name: "Roulette", category: "originals", cover: "/img/verdant/games/roulette.webp", theme: ["#35e889", "#087c4b"], blurb: "Классическая рулетка на 37 секторов" },
};
export const GAME_NAMES = Object.fromEntries(GAME_SLUGS.map((s) => [s, GAMES[s].name])) as Record<GameSlug, string>;
export const CATEGORY_NAMES: Record<GameCategory, string> = { slots: "Слоты", originals: "Быстрые игры", table: "Карточные игры" };
/** Подборки лобби: популярные (вручную) и быстрые раунды. */
export const POPULAR: GameSlug[] = ["crash", "mines", "plinko", "roulette", "dice", "coinflip"];
/** RTP для карточки игры: у слотов и кено — по таблицам, у остальных — 100% минус преимущество. */
export function rtpLabel(slug: GameSlug, edgeBp: number): string {
  const fixed: Partial<Record<GameSlug, string>> = { avalanche: "97%", salute: "95,5%", crystal: "96,5%", workshop: "95,5%", atlas: "95,5%", "neon-garden": "95,8%", keno: "96–97,5%", plinko: "97–99,5%", wheel: "99%", roulette: "97,3%", blackjack: "99,3%", videopoker: "99,5%", baccarat: "98,9%" };
  return fixed[slug] ?? `${(100 - edgeBp / 100).toFixed(2).replace(".", ",")}%`;
}
export const isGameSlug = (s: string): s is GameSlug => (GAME_SLUGS as readonly string[]).includes(s);
