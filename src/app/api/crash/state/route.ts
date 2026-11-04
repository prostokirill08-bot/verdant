import { route } from "@/server/http";
import { db } from "@/server/db";
import { crashSnapshot } from "@/server/crash/service";

// Снимок состояния на случай, если WebSocket недоступен. Для вошедшего игрока — ещё и ID его ставки
// в текущем раунде: в публичном списке ставок ник может быть скрыт (анонимный режим, сотрудники).
export const GET = route({ rate: { key: "crash-state", limit: 120, window: 60 } }, async ({ user }) => {
  const snap = await crashSnapshot();
  const mine = user && snap.round ? await db.round.findFirst({ where: { userId: user.id, crashId: snap.round.id }, select: { id: true } }) : null;
  return { ...snap, myBetId: mine?.id ?? null };
});
