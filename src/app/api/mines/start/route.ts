import { route, body } from "@/server/http";
import { minesStart, startMines } from "@/server/games/mines";

export const POST = route({ auth: true, rate: { key: "bet", limit: 300, window: 60 } }, async ({ req, user }) => startMines(user!.id, await body(req, minesStart)));
