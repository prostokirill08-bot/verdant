import { route, body } from "@/server/http";
import * as A from "@/server/admin/service";
import { ADMIN_RATE } from "@/server/admin/route-helpers";

export const GET = route({ auth: "SUPPORT", rate: ADMIN_RATE }, async () => ({ settings: await A.getPlatform() }));
export const PATCH = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ req, user, ip }) => ({ settings: await A.updateSettings(user!, await body(req, A.settingsInput), ip) }));
