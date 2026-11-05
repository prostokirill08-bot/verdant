import { route } from "@/server/http";
import { evaluate, listAchievements } from "@/server/progress/engine";

/** Достижения с прогрессом. Перед ответом сервер проверяет, не выполнено ли что-то новое. */
export const GET = route({ auth: true, rate: { key: "ach", limit: 60, window: 60 } }, async ({ user }) => {
  await evaluate(user!.id);
  return listAchievements(user!.id);
});
