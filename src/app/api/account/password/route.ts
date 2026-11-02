import { z } from "zod";
import { route, body, HttpError } from "@/server/http";
import { db } from "@/server/db";
import { passwordSchema } from "@/server/auth/schemas";
import { hashPassword, verifyPassword } from "@/server/security/password";
import { audit } from "@/server/security/audit";

const schema = z.object({ current: z.string().min(1).max(128), next: passwordSchema });
export const POST = route({ auth: true, rate: { key: "pwchange", limit: 5, window: 900 } }, async ({ req, user, ip }) => {
  const p = await body(req, schema);
  const u = await db.user.findUniqueOrThrow({ where: { id: user!.id } });
  if (!(await verifyPassword(p.current, u.passwordHash))) throw new HttpError(400, "Текущий пароль неверный", "bad_password");
  await db.$transaction([
    db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(p.next) } }),
    db.session.deleteMany({ where: { userId: u.id, id: { not: user!.sessionId } } }),
  ]);
  await audit("account.password_change", { actorId: u.id, ip });
  return { ok: true };
});
