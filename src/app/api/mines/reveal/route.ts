import { route, body } from "@/server/http";
import { minesReveal, revealTile } from "@/server/games/mines";

export const POST = route({ auth: true, rate: { key: "mines", limit: 600, window: 60 } }, async ({ req, user }) => revealTile(user!.id, (await body(req, minesReveal)).tile));
