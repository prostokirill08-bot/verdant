import { route, body } from "@/server/http";
import { startVideopoker, vpStart } from "@/server/games/videopoker";

export const POST = route({ auth: true, rate: { key: "bet", limit: 300, window: 60 } }, async ({ req, user }) => startVideopoker(user!.id, await body(req, vpStart)));
