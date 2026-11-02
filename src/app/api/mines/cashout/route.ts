import { route } from "@/server/http";
import { cashoutMines } from "@/server/games/mines";

export const POST = route({ auth: true, rate: { key: "mines", limit: 600, window: 60 } }, async ({ user }) => cashoutMines(user!.id));
