import { route } from "@/server/http";
import * as A from "@/server/admin/service";
import { ADMIN_RATE, userIdParam } from "@/server/admin/route-helpers";

export const DELETE = route({ auth: "SUPPORT", rate: ADMIN_RATE }, async ({ params, user, ip }) => A.revokeUserSessions(user!, userIdParam(params.id), ip));
