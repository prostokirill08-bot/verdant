import { route } from "@/server/http";
import { towerActive } from "@/server/games/tower";

export const GET = route({ auth: true }, async ({ user }) => ({ round: await towerActive(user!.id) }));
