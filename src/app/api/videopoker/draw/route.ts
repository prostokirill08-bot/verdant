import { route, body } from "@/server/http";
import { drawVideopoker, vpHold } from "@/server/games/videopoker";

export const POST = route({ auth: true, rate: { key: "step", limit: 600, window: 60 } }, async ({ req, user }) => drawVideopoker(user!.id, (await body(req, vpHold)).held));
