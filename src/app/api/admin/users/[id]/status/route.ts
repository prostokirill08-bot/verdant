import { route, body } from "@/server/http";
import * as A from "@/server/admin/service";
import { ADMIN_RATE, userIdParam } from "@/server/admin/route-helpers";

export const POST = route({ auth: "SUPPORT", rate: ADMIN_RATE }, async ({ req, params, user, ip }) => { const b = await body(req, A.statusInput); await A.setUserStatus(user!, userIdParam(params.id), b.status, b.reason, ip); return { ok: true }; });
