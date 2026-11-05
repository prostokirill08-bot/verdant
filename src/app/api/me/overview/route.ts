import { route } from "@/server/http";
import { db } from "@/server/db";
import { accountSummary } from "@/server/wallet/service";
import { gameSessions, profileStats, recentGames } from "@/server/progress/profile";
import { listAchievements } from "@/server/progress/engine";

/** Профиль игрока целиком: карточка, статистика, избранное, недавние игры, сессии и достижения. */
export const GET = route({ auth: true, rate: { key: "overview", limit: 60, window: 60 } }, async ({ user }) => {
  const id = user!.id;
  const [summary, stats, recent, sessions, ach, favs] = await Promise.all([
    accountSummary(id), profileStats(id), recentGames(id), gameSessions(id, 10), listAchievements(id),
    db.favorite.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { gameSlug: true } }),
  ]);
  return {
    ...summary, profile: stats, recent, sessions, favorites: favs.map((f) => f.gameSlug),
    achievements: { unlocked: ach.items.filter((a) => a.unlockedAt).length, total: ach.items.length, latest: ach.items.filter((a) => a.unlockedAt).sort((a, b) => +new Date(b.unlockedAt!) - +new Date(a.unlockedAt!)).slice(0, 6) },
  };
});
