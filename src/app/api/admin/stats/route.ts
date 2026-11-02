import { route } from "@/server/http";
import * as A from "@/server/admin/service";
import { ADMIN_RATE } from "@/server/admin/route-helpers";

export const GET = route({ auth: "SUPPORT", rate: ADMIN_RATE }, async () => A.adminStats());
