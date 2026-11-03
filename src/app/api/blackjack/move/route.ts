import { route, body } from "@/server/http";
import { bjMove, moveBlackjack } from "@/server/games/blackjack";

export const POST = route({ auth: true, rate: { key: "step", limit: 600, window: 60 } }, async ({ req, user }) => moveBlackjack(user!.id, (await body(req, bjMove)).action));
