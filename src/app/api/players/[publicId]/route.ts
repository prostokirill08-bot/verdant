import { HttpError, route } from "@/server/http";
import { publicProfile } from "@/server/progress/leaderboard";

export const GET = route({ rate: { key: "player", limit: 60, window: 60 } }, async ({ params }) => {
  if (!/^[A-Z0-9-]{4,24}$/.test(params.publicId ?? "")) throw new HttpError(404, "Профиль не найден", "not_found");
  return publicProfile(params.publicId!);
});
