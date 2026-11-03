import { route, body } from "@/server/http";
import { guessHilo, hiloGuess } from "@/server/games/hilo";

export const POST = route({ auth: true, rate: { key: "step", limit: 600, window: 60 } }, async ({ req, user }) => guessHilo(user!.id, (await body(req, hiloGuess)).guess));
