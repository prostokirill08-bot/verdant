import { route } from "@/server/http";
import { videopokerActive } from "@/server/games/videopoker";

export const GET = route({ auth: true }, async ({ user }) => ({ round: await videopokerActive(user!.id) }));
