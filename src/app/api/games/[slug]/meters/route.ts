import { route, HttpError } from "@/server/http";
import { db } from "@/server/db";
import { decodeMeters, emptyMeters, meterView } from "@/lib/fair/workshop";

// Состояние сундуков игрока в «Сундуков удачи»: сколько монет собрано, сколько нужно, ставка бонуса
export const GET = route({ rate: { key: "rounds", limit: 120, window: 60 } }, async ({ user, params }) => {
  if (params.slug !== "workshop") throw new HttpError(404, "Игра не найдена", "not_found");
  if (!user) return { chests: meterView(emptyMeters()) };
  const row = await db.slotMeter.findUnique({ where: { userId_gameSlug: { userId: user.id, gameSlug: "workshop" } } });
  return { chests: meterView(decodeMeters((row?.state as { s?: string } | null)?.s)) };
});
