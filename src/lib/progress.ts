// Каталог метрик, иконок и стартовых достижений/заданий. Общий для сервера (подсчёт) и клиента (подписи).

/** Метрики достижений: считаются сервером по всем раундам и дням активности игрока. */
export const ACHIEVEMENT_METRICS = {
  rounds_total: "Сыграно раундов",
  wins_total: "Выигранных раундов",
  games_distinct: "Разных игр",
  active_days: "Дней активности",
  streak_days: "Дней активности подряд",
  best_multiplier: "Лучший множитель (×)",
  wagered_total: "Поставлено рублей",
} as const;
export type AchievementMetric = keyof typeof ACHIEVEMENT_METRICS;

/** Метрики ежедневных заданий: только за текущие сутки (по Москве). */
export const QUEST_METRICS = {
  visit_today: "Зайти на платформу",
  rounds_today: "Сыграть раундов",
  wins_today: "Выиграть раундов",
  games_today: "Разных игр за день",
  categories_today: "Разных категорий за день",
  new_game_today: "Новых для себя игр",
  wagered_today: "Поставить рублей",
} as const;
export type QuestMetric = keyof typeof QUEST_METRICS;

export const isAchievementMetric = (m: string): m is AchievementMetric => m in ACHIEVEMENT_METRICS;
export const isQuestMetric = (m: string): m is QuestMetric => m in QUEST_METRICS;

/** Раунд засчитывается в прогресс, если ставка не меньше 1 ₽ (как и в турнире) — мелкими ставками не «нафармить». */
export const PROGRESS_MIN_BET = 100n;

/** Встроенные иконки достижений (SVG-пути 24×24). */
export const ACH_ICONS: Record<string, string> = {
  spark: "M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z",
  flame: "M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4 3 7 7 7z",
  trophy: "M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6v4H9z",
  crown: "M3 8l4 4 5-7 5 7 4-4-2 11H5z",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h3v3H8z",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  gem: "M7 4h10l4 5-9 11L3 9zM3 9h18M9.5 9 12 4l2.5 5L12 20z",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  star: "m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z",
  rocket: "M5 15c-1 1-2 4-2 6 2 0 5-1 6-2M9 15l-3-3c2-5 6-9 13-9 0 7-4 11-9 13zM14 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  medal: "M8 3h8l-2 6h-4zM12 9a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM12 12l1 2h2l-1.5 1.4.6 2.1L12 16.3l-2.1 1.2.6-2.1L9 14h2z",
};
export const ACH_ICON_KEYS = Object.keys(ACH_ICONS);

type Def = { code: string; title: string; description: string; metric: string; target: number; reward: number; sortOrder: number };
/** Стартовый набор достижений (награда — в копейках). Администратор может менять их в админке. */
export const DEFAULT_ACHIEVEMENTS: (Def & { icon: string })[] = [
  { code: "first_game", title: "Первый запуск", description: "Сыграй первый раунд в любой игре", icon: "spark", metric: "rounds_total", target: 1, reward: 1_000, sortOrder: 1 },
  { code: "rounds_10", title: "Разогрев", description: "Сыграй 10 раундов", icon: "flame", metric: "rounds_total", target: 10, reward: 2_500, sortOrder: 2 },
  { code: "rounds_100", title: "Сотня", description: "Сыграй 100 раундов", icon: "trophy", metric: "rounds_total", target: 100, reward: 10_000, sortOrder: 3 },
  { code: "rounds_1000", title: "Марафонец", description: "Сыграй 1 000 раундов", icon: "crown", metric: "rounds_total", target: 1000, reward: 50_000, sortOrder: 4 },
  { code: "first_win", title: "Первая победа", description: "Выиграй первый раунд в демо-режиме", icon: "star", metric: "wins_total", target: 1, reward: 1_000, sortOrder: 5 },
  { code: "wins_50", title: "Везунчик", description: "Выиграй 50 раундов", icon: "medal", metric: "wins_total", target: 50, reward: 10_000, sortOrder: 6 },
  { code: "games_5", title: "Исследователь", description: "Сыграй в 5 разных игр", icon: "compass", metric: "games_distinct", target: 5, reward: 5_000, sortOrder: 7 },
  { code: "games_15", title: "Коллекционер", description: "Сыграй в 15 разных игр", icon: "gem", metric: "games_distinct", target: 15, reward: 20_000, sortOrder: 8 },
  { code: "streak_3", title: "Три дня подряд", description: "Заходи на платформу 3 дня подряд", icon: "bolt", metric: "streak_days", target: 3, reward: 3_000, sortOrder: 9 },
  { code: "days_7", title: "Неделя с VERDANT", description: "Будь активен 7 разных дней", icon: "calendar", metric: "active_days", target: 7, reward: 10_000, sortOrder: 10 },
  { code: "days_30", title: "Месяц с VERDANT", description: "Будь активен 30 разных дней", icon: "calendar", metric: "active_days", target: 30, reward: 50_000, sortOrder: 11 },
  { code: "mult_10", title: "Десятикратно", description: "Выиграй раунд с множителем от 10×", icon: "target", metric: "best_multiplier", target: 10, reward: 5_000, sortOrder: 12 },
  { code: "mult_100", title: "Сотня иксов", description: "Выиграй раунд с множителем от 100×", icon: "rocket", metric: "best_multiplier", target: 100, reward: 25_000, sortOrder: 13 },
];

/** Стартовый набор ежедневных заданий. pinned — показываются каждый день. */
export const DEFAULT_QUESTS: (Def & { pinned: boolean })[] = [
  { code: "visit", title: "Посетить платформу", description: "Зайди на VERDANT сегодня", metric: "visit_today", target: 1, reward: 500, pinned: true, sortOrder: 1 },
  { code: "rounds_3", title: "Сыграть 3 раунда", description: "Сыграй 3 раунда со ставкой от 1 ₽", metric: "rounds_today", target: 3, reward: 1_000, pinned: true, sortOrder: 2 },
  { code: "new_game", title: "Попробовать новую игру", description: "Сыграй в игру, в которую ещё не играл", metric: "new_game_today", target: 1, reward: 1_500, pinned: false, sortOrder: 3 },
  { code: "two_categories", title: "Две категории", description: "Сыграй в 2 разные категории: слоты, быстрые или карточные", metric: "categories_today", target: 2, reward: 1_500, pinned: false, sortOrder: 4 },
  { code: "three_games", title: "Три игры", description: "Сыграй в 3 разные игры за день", metric: "games_today", target: 3, reward: 1_500, pinned: false, sortOrder: 5 },
  { code: "win_once", title: "Победный раунд", description: "Выиграй хотя бы один раунд", metric: "wins_today", target: 1, reward: 1_000, pinned: false, sortOrder: 6 },
  { code: "rounds_20", title: "Серия из 20", description: "Сыграй 20 раундов за день", metric: "rounds_today", target: 20, reward: 3_000, pinned: false, sortOrder: 7 },
];

/** Сколько заданий выдаётся в день (закреплённые + чередующиеся). */
export const DAILY_QUEST_COUNT = 4;
