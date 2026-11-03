import { route } from "@/server/http";
import { blackjackActive } from "@/server/games/blackjack";

export const GET = route({ auth: true }, async ({ user }) => ({ round: await blackjackActive(user!.id) }));
