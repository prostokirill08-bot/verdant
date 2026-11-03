import { route } from "@/server/http";
import { hiloActive } from "@/server/games/hilo";

export const GET = route({ auth: true }, async ({ user }) => ({ round: await hiloActive(user!.id) }));
