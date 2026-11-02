// Общий список игр для навигации (каталог и настройки берутся из БД).
export const GAME_SLUGS = ["crash", "mines", "dice", "plinko", "limbo", "roulette"] as const;
export type GameSlug = (typeof GAME_SLUGS)[number];
export const GAME_NAMES: Record<GameSlug, string> = { crash: "Crash", mines: "Mines", dice: "Dice", plinko: "Plinko", limbo: "Limbo", roulette: "Roulette" };
export const isGameSlug = (s: string): s is GameSlug => (GAME_SLUGS as readonly string[]).includes(s);
