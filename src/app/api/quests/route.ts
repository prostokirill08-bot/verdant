import { route } from "@/server/http";
import { evaluate, listQuests } from "@/server/progress/engine";

export const GET = route({ auth: true, rate: { key: "quests", limit: 60, window: 60 } }, async ({ user }) => {
  await evaluate(user!.id);
  return listQuests(user!.id);
});
