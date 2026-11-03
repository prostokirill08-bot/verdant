import { route } from "@/server/http";
import { cashoutTower } from "@/server/games/tower";

export const POST = route({ auth: true, rate: { key: "step", limit: 600, window: 60 } }, async ({ user }) => cashoutTower(user!.id));
