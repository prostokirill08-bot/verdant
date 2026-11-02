import { route } from "@/server/http";
import * as A from "@/server/admin/service";
import { ADMIN_RATE } from "@/server/admin/route-helpers";

export const DELETE = route({ auth: "SUPPORT", rate: ADMIN_RATE }, async ({ params, user, ip }) => { await A.revokeSession(user!, params.ref ?? "", ip); return { ok: true }; });
