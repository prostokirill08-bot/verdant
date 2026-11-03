import { route, body } from "@/server/http";
import { bjStart, startBlackjack } from "@/server/games/blackjack";

export const POST = route({ auth: true, rate: { key: "bet", limit: 300, window: 60 } }, async ({ req, user }) => startBlackjack(user!.id, await body(req, bjStart)));
