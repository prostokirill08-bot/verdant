import { db } from "../db";
import { HttpError } from "../http";
import { audit } from "../security/audit";
import { randomToken } from "../security/tokens";
import { registerUser } from "../auth/service";
import { isGuestEmail, TELEGRAM_DOMAIN } from "@/lib/guest";
import type { SessionUser } from "../auth/session";
import type { TgUser } from "./initData";

/** Ник из Telegram под наши правила (латиница, цифры, _; 3–20). Кириллицу и пустые имена заменяем на tg_<id>. */
function nickFor(u: TgUser): string[] {
  const clean = (s?: string) => (s ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
  const base = clean(u.username) || clean(u.first_name);
  const out: string[] = [];
  if (base.length >= 3) out.push(base, `${base.slice(0, 15)}_${String(u.id).slice(-4)}`);
  out.push(`tg_${u.id}`.slice(0, 20), `tg_${randomToken(6).replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}`);
  return out;
}

/**
 * Находит или создаёт аккаунт для пользователя Telegram.
 * Если в этом же окне Telegram уже выполнен вход в обычный аккаунт без привязки — привязываем его.
 */
export async function telegramAccount(tg: TgUser, current: SessionUser | null, ip: string) {
  const telegramId = BigInt(tg.id);
  const linked = await db.user.findUnique({ where: { telegramId } });
  if (linked) {
    if (linked.status === "BLOCKED") throw new HttpError(403, "Аккаунт заблокирован", "blocked");
    await db.user.update({ where: { id: linked.id }, data: { lastLoginAt: new Date() } });
    return { user: linked, created: false };
  }
  if (current && !isGuestEmail(current.email)) {
    const me = await db.user.findUnique({ where: { id: current.id } });
    if (me && me.telegramId === null) {
      const user = await db.user.update({ where: { id: me.id }, data: { telegramId, lastLoginAt: new Date() } });
      await audit("auth.telegram_link", { actorId: me.id, ip });
      return { user, created: false };
    }
  }
  for (const username of nickFor(tg)) {
    try {
      const u = await registerUser({ email: `tg_${tg.id}@${TELEGRAM_DOMAIN}`, username, password: randomToken(24) }, ip);
      const user = await db.user.update({ where: { id: u.id }, data: { telegramId, lastLoginAt: new Date() } });
      await audit("auth.telegram_signup", { actorId: u.id, ip });
      return { user, created: true };
    } catch (e) {
      if (!(e instanceof HttpError && e.code === "taken")) throw e;
      // почта занята — значит, аккаунт успели создать параллельным запросом
      const again = await db.user.findUnique({ where: { telegramId } });
      if (again) return { user: again, created: false };
    }
  }
  throw new HttpError(503, "Не удалось создать аккаунт, попробуй ещё раз", "tg_failed");
}
