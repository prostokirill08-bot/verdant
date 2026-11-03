import { route, body } from "@/server/http";
import { hiloStart, startHilo } from "@/server/games/hilo";

export const POST = route({ auth: true, rate: { key: "bet", limit: 300, window: 60 } }, async ({ req, user }) => startHilo(user!.id, await body(req, hiloStart)));
