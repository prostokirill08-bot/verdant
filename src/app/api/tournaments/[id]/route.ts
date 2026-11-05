import { HttpError, route } from "@/server/http";
import { tournamentDetails } from "@/server/promo/service";

export const GET = route({ rate: { key: "tour", limit: 60, window: 60 } }, async ({ params }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.id ?? "")) throw new HttpError(404, "Турнир не найден", "not_found");
  return tournamentDetails(params.id!);
});
