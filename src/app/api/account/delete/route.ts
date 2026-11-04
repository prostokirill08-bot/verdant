import { z } from "zod";
import { body, HttpError, route } from "@/server/http";
import { db } from "@/server/db";
import { destroySession } from "@/server/auth/session";
import { verifyPassword } from "@/server/security/password";
import { audit } from "@/server/security/audit";
import { isGuestEmail, isTelegramEmail } from "@/lib/guest";

const schema = z.object({ confirm: z.string().max(40), password: z.string().max(128).optional() });

/**
 * Удаление аккаунта навсегда: кошелёк, журнал, раунды, сеансы, пополнения и призы удаляются каскадом.
 * Подтверждение — ник, а для аккаунта с паролем ещё и пароль. Сотрудники удаляются только администратором.
 */
export const POST = route({ auth: true, rate: { key: "acc-delete", limit: 5, window: 900 } }, async ({ req, user, ip }) => {
  const p = await body(req, schema);
  if (user!.role !== "USER") throw new HttpError(403, "Аккаунт сотрудника удаляет администратор", "staff");
  if (p.confirm.trim() !== user!.username) throw new HttpError(400, "Введи свой ник точно, чтобы подтвердить удаление", "confirm");
  const u = await db.user.findUniqueOrThrow({ where: { id: user!.id }, select: { passwordHash: true, email: true } });
  const hasPassword = !isGuestEmail(u.email) && !isTelegramEmail(u.email);
  if (hasPassword && !(p.password && (await verifyPassword(p.password, u.passwordHash)))) throw new HttpError(400, "Неверный пароль", "bad_password");
  await db.user.delete({ where: { id: user!.id } });
  // В журнале остаётся только факт удаления и внутренний ID — без ника и почты
  await audit("account.deleted", { targetType: "user", targetId: user!.id, ip });
  await destroySession();
  return { ok: true };
});
