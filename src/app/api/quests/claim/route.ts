import { z } from "zod";
import { body, route } from "@/server/http";
import { claimQuest } from "@/server/progress/engine";
import { audit } from "@/server/security/audit";

const input = z.object({ code: z.string().regex(/^[a-z0-9_]{2,40}$/), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** Забрать награду за выполненное задание. Повтор запроса не начислит награду второй раз. */
export const POST = route({ auth: true, rate: { key: "quest-claim", limit: 20, window: 60 } }, async ({ req, user, ip }) => {
  const { code, day } = await body(req, input);
  const r = await claimQuest(user!.id, code, day);
  await audit("quest.claim", { actorId: user!.id, targetType: "quest", targetId: `${day}:${code}`, ip, meta: { reward: r.reward.toString() } });
  return r;
});
