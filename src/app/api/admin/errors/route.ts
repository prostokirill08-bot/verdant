import { route } from "@/server/http";
import { ADMIN_RATE } from "@/server/admin/route-helpers";
import * as P from "@/server/admin/progress";

export const GET = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ req }) => P.listErrors(req.nextUrl.searchParams.get("source") ?? undefined, req.nextUrl.searchParams.get("cursor") ?? undefined));
export const DELETE = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ user, ip }) => ({ removed: await P.clearErrors(user!, ip) }));
