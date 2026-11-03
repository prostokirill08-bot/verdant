import { route } from "@/server/http";
import { cashoutHilo } from "@/server/games/hilo";

export const POST = route({ auth: true, rate: { key: "step", limit: 600, window: 60 } }, async ({ user }) => cashoutHilo(user!.id));
