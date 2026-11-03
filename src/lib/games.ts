// Каталог игр: категория, новогодняя обложка, цвет темы. Настройки (лимиты, вкл/выкл) — в БД.
export const GAME_SLUGS = ["workshop", "atlas", "neon-garden", "blackjack", "videopoker", "baccarat", "sledrace", "crash", "mines", "tower", "hilo", "wheel", "keno", "coinflip", "dice", "plinko", "limbo", "roulette"] as const;
export type GameSlug = (typeof GAME_SLUGS)[number];
export type GameCategory = "slots" | "originals" | "table";

export type GameMeta = {
  name: string; category: GameCategory; cover: string; bg?: string;
  /** Два цвета темы: свечение и градиенты на странице игры и в карточке. */
  theme: [string, string]; badge?: "Новинка" | "Хит"; blurb: string;
};

export const GAMES: Record<GameSlug, GameMeta> = {
  workshop: { name: "Мастерская Санты", category: "slots", cover: "/img/ny/covers/workshop.webp", bg: "/img/ny/bg/workshop.webp", theme: ["#ffb02e", "#e8263f"], badge: "Новинка", blurb: "Монеты летят в 5 сундуков — у каждого свой бонус" },
  atlas: { name: "Атлас звёзд", category: "slots", cover: "/img/ny/covers/atlas.webp", bg: "/img/ny/bg/atlas.webp", theme: ["#5b8cff", "#ffd166"], badge: "Новинка", blurb: "Звёздная книга Деда Мороза: символ раскрывается на весь барабан" },
  "neon-garden": { name: "Зимний сад", category: "slots", cover: "/img/ny/covers/neon-garden.webp", bg: "/img/ny/bg/neon-garden.webp", theme: ["#ff4d6d", "#3ee08f"], badge: "Новинка", blurb: "Зимний сад: 3 подарка BONUS — фриспины с ×3" },
  blackjack: { name: "Блэкджек у камина", category: "table", cover: "/img/ny/covers/blackjack.webp", theme: ["#e8263f", "#ffd166"], badge: "Новинка", blurb: "Набери 21 раньше дилера: удвоение, сплит, блэкджек 3:2" },
  videopoker: { name: "Снежный покер", category: "table", cover: "/img/ny/covers/videopoker.webp", theme: ["#8fdcff", "#ffd166"], badge: "Новинка", blurb: "Видеопокер: оставь нужные карты и собери комбинацию — до ×800" },
  baccarat: { name: "Баккара", category: "table", cover: "/img/ny/covers/baccarat.webp", theme: ["#22c55e", "#ffd166"], badge: "Новинка", blurb: "Игрок, Банкир или Ничья — у кого ближе к 9" },
  sledrace: { name: "Гонка на санях", category: "originals", cover: "/img/ny/covers/sledrace.webp", theme: ["#5b8cff", "#ff8a3d"], badge: "Новинка", blurb: "Пять саночников с горы — угадай, кто приедет первым" },
  crash: { name: "Crash", category: "originals", cover: "/img/ny/covers/crash.webp", theme: ["#ff5f3d", "#ffd166"], badge: "Хит", blurb: "Санта летит на санях — забери до падения" },
  mines: { name: "Mines", category: "originals", cover: "/img/ny/covers/mines.webp", theme: ["#22c55e", "#ff4d6d"], blurb: "Собирай подарки, обходи бомбы" },
  dice: { name: "Dice", category: "originals", cover: "/img/ny/covers/dice.webp", theme: ["#8fdcff", "#e8263f"], blurb: "Ледяные кости: выбери шанс и брось" },
  plinko: { name: "Plinko", category: "originals", cover: "/img/ny/covers/plinko.webp", theme: ["#e8263f", "#ffd166"], blurb: "Ёлочная игрушка скачет по гирлянде" },
  limbo: { name: "Limbo", category: "originals", cover: "/img/ny/covers/limbo.webp", theme: ["#ffd166", "#3ee08f"], blurb: "Рождественская звезда — как высоко взлетит?" },
  tower: { name: "Башня", category: "originals", cover: "/img/ny/covers/tower.webp", theme: ["#8fdcff", "#ffd166"], badge: "Новинка", blurb: "Ледяная башня с подарком на вершине" },
  hilo: { name: "Hi-Lo", category: "table", cover: "/img/ny/covers/hilo.webp", theme: ["#ef4444", "#fbbf24"], badge: "Новинка", blurb: "Новогодние карты: выше или ниже?" },
  wheel: { name: "Колесо фортуны", category: "originals", cover: "/img/ny/covers/wheel.webp", theme: ["#e8263f", "#ffffff"], badge: "Новинка", blurb: "Колесо-леденец — до 19,8×" },
  keno: { name: "Кено", category: "originals", cover: "/img/ny/covers/keno.webp", theme: ["#8fdcff", "#e8263f"], badge: "Новинка", blurb: "Ёлочные шары с номерами — выбери до 10" },
  coinflip: { name: "Монетка", category: "originals", cover: "/img/ny/covers/coinflip.webp", theme: ["#ffd166", "#3ee08f"], badge: "Новинка", blurb: "Золотая монета со снежинкой" },
  roulette: { name: "Roulette", category: "originals", cover: "/img/ny/covers/roulette.webp", theme: ["#ef4444", "#16a34a"], blurb: "Праздничная рулетка на 37 секторов" },
};
export const GAME_NAMES = Object.fromEntries(GAME_SLUGS.map((s) => [s, GAMES[s].name])) as Record<GameSlug, string>;
export const CATEGORY_NAMES: Record<GameCategory, string> = { slots: "Слоты", originals: "Быстрые игры", table: "Карточные игры" };
/** Подборки лобби: популярные (вручную) и быстрые раунды. */
export const POPULAR: GameSlug[] = ["workshop", "crash", "blackjack", "mines", "atlas", "plinko", "sledrace", "roulette"];
/** RTP для карточки игры: у слотов и кено — по таблицам, у остальных — 100% минус преимущество. */
export function rtpLabel(slug: GameSlug, edgeBp: number): string {
  const fixed: Partial<Record<GameSlug, string>> = { workshop: "95,5%", atlas: "95,5%", "neon-garden": "95,8%", keno: "96–97,5%", plinko: "97–99,5%", wheel: "99%", roulette: "97,3%", blackjack: "99,3%", videopoker: "99,5%", baccarat: "98,9%" };
  return fixed[slug] ?? `${(100 - edgeBp / 100).toFixed(2).replace(".", ",")}%`;
}
export const isGameSlug = (s: string): s is GameSlug => (GAME_SLUGS as readonly string[]).includes(s);
