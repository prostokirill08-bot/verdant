import { route } from "@/server/http";
import * as A from "@/server/admin/service";
import { ADMIN_RATE, userIdParam } from "@/server/admin/route-helpers";

export const GET = route({ auth: "SUPPORT", rate: ADMIN_RATE }, async ({ params }) => A.userDetail(userIdParam(params.id)));
