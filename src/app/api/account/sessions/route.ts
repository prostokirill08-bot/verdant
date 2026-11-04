import { route } from "@/server/http";
import { db } from "@/server/db";
import { audit } from "@/server/security/audit";

export const GET = route({ auth: true }, async ({ user }) => {
  const list = await db.session.findMany({ where: { userId: user!.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, userAgent: true, createdAt: true } });
  return { sessions: list.map((s) => ({ current: s.id === user!.sessionId, userAgent: s.userAgent, createdAt: s.createdAt })) };
});
export const DELETE = route({ auth: true }, async ({ user, ip }) => {
  const r = await db.session.deleteMany({ where: { userId: user!.id, id: { not: user!.sessionId } } });
  await audit("account.sessions_revoke", { actorId: user!.id, ip, meta: { count: r.count } });
  return { revoked: r.count };
});
