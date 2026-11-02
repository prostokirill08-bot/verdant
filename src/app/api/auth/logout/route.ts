import { route } from "@/server/http";
import { destroySession } from "@/server/auth/session";
import { audit } from "@/server/security/audit";

export const POST = route({}, async ({ user, ip }) => {
  if (user) await audit("auth.logout", { actorId: user.id, ip });
  await destroySession(user?.sessionId);
  return { ok: true };
});
