import { body, route } from "@/server/http";
import { ADMIN_RATE } from "@/server/admin/route-helpers";
import * as P from "@/server/admin/progress";

export const PUT = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ req, user, ip }) => P.setQuestSettings(user!, await body(req, P.questSettingsInput), ip));
