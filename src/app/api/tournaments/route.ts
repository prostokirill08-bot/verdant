import { route } from "@/server/http";
import { tournamentHistory } from "@/server/promo/service";

export const GET = route({ rate: { key: "tours", limit: 60, window: 60 } }, async () => ({ history: await tournamentHistory(30) }));
