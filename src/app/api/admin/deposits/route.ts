import { route } from "@/server/http";
import { ADMIN_RATE } from "@/server/admin/route-helpers";
import { depositReport } from "@/server/wallet/deposit";

export const GET = route({ auth: "SUPPORT", rate: ADMIN_RATE }, async () => depositReport());
