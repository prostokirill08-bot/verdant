import { route } from "@/server/http";
import { claimDailyBonus } from "@/server/wallet/service";

export const POST = route({ auth: true, rate: { key: "bonus", limit: 10, window: 60 } }, async ({ user, ip }) => ({ balance: await claimDailyBonus(user!.id, ip) }));
