import { route } from "@/server/http";
import { recentGames } from "@/server/progress/profile";

export const GET = route({}, async ({ user }) => ({ recent: user ? await recentGames(user.id) : [] }));
