import { route, HttpError } from "@/server/http";
import { db } from "@/server/db";
import { roundView } from "@/server/games/rounds";
import { publicUser, PUBLIC_USER_SELECT } from "@/server/security/privacy";

// Карточка раунда. Чужие раунды видны без сидов и скрытого состояния.
export const GET = route({ rate: { key: "round", limit: 120, window: 60 } }, async ({ params, user }) => {
  const id = params.id!;
  if (!/^[a-z0-9]{10,40}$/.test(id)) throw new HttpError(404, "Раунд не найден", "not_found");
  const r = await db.round.findUnique({ where: { id }, include: { seedPair: true, crash: true, user: { select: PUBLIC_USER_SELECT } } });
  if (!r || r.status === "ACTIVE") throw new HttpError(404, "Раунд не найден", "not_found");
  const v = roundView(r);
  const own = r.userId === user?.id;
  return { round: { ...v, user: own ? r.user.username : publicUser(r.user).user, fair: own || r.crash ? v.fair : null } };
});
