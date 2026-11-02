import { route } from "@/server/http";
import { minesActive } from "@/server/games/mines";

export const GET = route({ auth: true }, async ({ user }) => ({ round: await minesActive(user!.id) }));
