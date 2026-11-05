import { body, route } from "@/server/http";
import { ADMIN_RATE } from "@/server/admin/route-helpers";
import * as P from "@/server/admin/progress";

export const GET = route({ auth: "SUPPORT", rate: ADMIN_RATE }, async () => P.listAchievementDefs());
export const POST = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ req, user, ip }) => ({ item: await P.upsertAchievement(user!, await body(req, P.achievementInput), ip, true) }));
