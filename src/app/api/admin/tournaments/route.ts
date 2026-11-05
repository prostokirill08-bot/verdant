import { body, route } from "@/server/http";
import { ADMIN_RATE } from "@/server/admin/route-helpers";
import { audit } from "@/server/security/audit";
import { currentTournament, setTournamentSettings, tournamentHistory, tournamentSchema, tournamentSettings } from "@/server/promo/service";

export const GET = route({ auth: "SUPPORT", rate: ADMIN_RATE }, async () => {
  const [settings, current, history] = await Promise.all([tournamentSettings(), currentTournament(), tournamentHistory(30)]);
  return { settings, current: { ...current, top: current.top.map(({ userId: _u, ...r }) => r) }, history };
});
/** Настройки турнира: вкл/выкл, название, минимальная ставка, призы (демо-кредиты). Новые призы действуют со следующей недели. */
export const PUT = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ req, user, ip }) => {
  const next = await setTournamentSettings(await body(req, tournamentSchema.partial()));
  await audit("admin.tournament.settings", { actorId: user!.id, ip, meta: next });
  return { settings: next };
});
