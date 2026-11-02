import { route, body } from "@/server/http";
import { betInput, playInstant } from "@/server/games/play";

// Мгновенные игры: Dice, Limbo, Plinko, Roulette
export const POST = route({ auth: true, rate: { key: "bet", limit: 300, window: 60 } }, async ({ req, user, params, ip }) =>
  playInstant(user!.id, params.slug!, await body(req, betInput), ip));
