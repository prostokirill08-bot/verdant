import { route, body } from "@/server/http";
import { pickTower, towerPick } from "@/server/games/tower";

export const POST = route({ auth: true, rate: { key: "step", limit: 600, window: 60 } }, async ({ req, user }) => pickTower(user!.id, (await body(req, towerPick)).tile));
