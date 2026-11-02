import { route, body } from "@/server/http";
import * as A from "@/server/admin/service";
import { ADMIN_RATE } from "@/server/admin/route-helpers";

export const PATCH = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ req, params, user, ip }) => ({ game: await A.updateGame(user!, params.slug ?? "", await body(req, A.gameInput), ip) }));
