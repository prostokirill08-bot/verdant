import { route } from "@/server/http";
import { ADMIN_RATE } from "@/server/admin/route-helpers";
import * as P from "@/server/admin/progress";

/** Журнал операций всех кошельков (только администратор: суммы и ники всех игроков). */
export const GET = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ req }) => P.listLedger(P.ledgerQuery.parse(Object.fromEntries(req.nextUrl.searchParams))));
