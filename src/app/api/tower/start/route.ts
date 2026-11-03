import { route, body } from "@/server/http";
import { startTower, towerStart } from "@/server/games/tower";

export const POST = route({ auth: true, rate: { key: "bet", limit: 300, window: 60 } }, async ({ req, user }) => startTower(user!.id, await body(req, towerStart)));
