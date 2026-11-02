import { route, body } from "@/server/http";
import * as A from "@/server/admin/service";
import { ADMIN_RATE, userIdParam } from "@/server/admin/route-helpers";

export const POST = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ req, params, user, ip }) => A.adjustBalance(user!, userIdParam(params.id), await body(req, A.adjustInput), ip));
