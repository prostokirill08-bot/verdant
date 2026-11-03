import { Prisma } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../http";
import { hashPassword, verifyPassword } from "../security/password";
import { publicId, randomToken, sha256 } from "../security/tokens";
import { audit } from "../security/audit";
import { applyEntry, withTx } from "../wallet/ledger";
import { getPlatform } from "../settings";
import { createSeedPair } from "../games/fair";
import { appUrl } from "../config";

const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;

export async function registerUser(p: { email: string; username: string; password: string }, ip: string) {
  const settings = await getPlatform();
  if (!settings.registrationOpen) throw new HttpError(403, "Регистрация временно закрыта", "registration_closed");
  const passwordHash = await hashPassword(p.password);
  try {
    const user = await withTx(async (tx) => {
      const u = await tx.user.create({ data: { email: p.email, username: p.username, passwordHash, publicId: publicId(), wallet: { create: {} } } });
      if (settings.startGrant > 0) await applyEntry(tx, { userId: u.id, type: "DEMO_GRANT", amount: BigInt(settings.startGrant), idempotencyKey: `signup:${u.id}`, note: "Стартовые демо-снежинки" });
      await createSeedPair(tx, u.id);
      return u;
    }, 1); // занятый email/ник повторять бессмысленно
    await audit("auth.register", { actorId: user.id, ip });
    return user;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const field = String((e.meta?.target as string[] | undefined)?.join(",") ?? "");
      throw new HttpError(409, field.includes("email") ? "Этот email уже зарегистрирован" : "Этот ник уже занят", "taken");
    }
    throw e;
  }
}

export async function checkLogin(login: string, password: string, ip: string) {
  const l = login.toLowerCase();
  const user = await db.user.findFirst({ where: l.includes("@") ? { email: l } : { username: { equals: login, mode: "insensitive" } } });
  // одинаковое сообщение — не раскрываем, существует ли аккаунт
  const fail = new HttpError(401, "Неверный логин или пароль", "bad_credentials");
  if (!user) { await verifyPassword(password, "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"); throw fail; }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new HttpError(423, "Слишком много неудачных попыток. Попробуй через 15 минут.", "locked");
  if (!(await verifyPassword(password, user.passwordHash))) {
    const fails = user.failedLogins + 1;
    await db.user.update({ where: { id: user.id }, data: { failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null } });
    await audit(fails >= MAX_FAILS ? "auth.lockout" : "auth.login_failed", { actorId: user.id, ip });
    throw fail;
  }
  if (user.status === "BLOCKED") throw new HttpError(403, "Аккаунт заблокирован", "blocked");
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit("auth.login", { actorId: user.id, ip, meta: { role: user.role } });
  return user;
}

const RESET_TTL = 30 * 60 * 1000;

/** Создаёт ссылку восстановления. Пока нет почтового сервиса — ссылка пишется в журнал сервера. */
export async function requestReset(email: string, ip: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return;                     // ответ всегда одинаковый
  const token = randomToken(32);
  await db.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL) } });
  const link = `${appUrl()}/reset-password?token=${token}`;
  console.info(`[mail] Ссылка восстановления для ${email}: ${link}`);
  await audit("auth.reset_requested", { actorId: user.id, ip });
}

export async function resetPassword(token: string, password: string, ip: string) {
  const r = await db.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
  if (!r || r.usedAt || r.expiresAt < new Date()) throw new HttpError(400, "Ссылка недействительна или устарела", "bad_token");
  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.user.update({ where: { id: r.userId }, data: { passwordHash, failedLogins: 0, lockedUntil: null } }),
    db.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: r.userId } }),      // выходим со всех устройств
  ]);
  await audit("auth.password_reset", { actorId: r.userId, ip });
}
