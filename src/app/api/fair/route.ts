import { route, body } from "@/server/http";
import { fairInfo, rotateInput, rotateSeed } from "@/server/games/seeds";
import { audit } from "@/server/security/audit";

export const GET = route({ auth: true }, async ({ user }) => fairInfo(user!.id));

// Смена пары сидов (раскрывает текущий серверный сид)
export const POST = route({ auth: true, rate: { key: "seed-rotate", limit: 20, window: 60 } }, async ({ req, user, ip }) => {
  const { clientSeed } = await body(req, rotateInput);
  const res = await rotateSeed(user!.id, clientSeed);
  await audit("fair.rotate", { actorId: user!.id, ip });
  return res;
});
