import { route, body } from "@/server/http";
import { crashBetInput, placeCrashBet } from "@/server/crash/service";

export const POST = route({ auth: true, rate: { key: "bet", limit: 300, window: 60 } }, async ({ req, user }) => placeCrashBet(user!.id, await body(req, crashBetInput)));
