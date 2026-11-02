import { route } from "@/server/http";
import { cashoutCrash } from "@/server/crash/service";

export const POST = route({ auth: true, rate: { key: "crash-cashout", limit: 120, window: 60 } }, async ({ user }) => cashoutCrash(user!.id));
