import { route } from "@/server/http";
import { ADMIN_RATE } from "@/server/admin/route-helpers";
import { audit } from "@/server/security/audit";
import { payTournament } from "@/server/promo/service";

/** Подвести итоги прошедшей недели вручную (то же делает фоновая задача; повторный запуск безопасен). */
export const POST = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ user, ip }) => {
  const paid = await payTournament();
  await audit("admin.tournament.finalize", { actorId: user!.id, ip, meta: { paid } });
  return { paid };
});
