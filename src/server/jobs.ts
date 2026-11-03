import { db } from "./db";
import { GUEST_DOMAIN } from "@/lib/guest";

/** Фоновая уборка: просроченные сессии, ссылки восстановления пароля и старые демо-гости. Безопасно запускать на любом экземпляре. */
export async function cleanup() {
  const now = new Date();
  const [s, r] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordReset.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
  ]);
  // Демо-гости живут 3 дня; кошелёк, журнал и раунды удаляются каскадом вместе с аккаунтом
  const g = await db.user.deleteMany({ where: { email: { endsWith: `@${GUEST_DOMAIN}` }, createdAt: { lt: new Date(now.getTime() - 3 * 24 * 3600 * 1000) } } });
  if (s.count || r.count || g.count) console.log(`[jobs] удалено: сессий ${s.count}, ссылок сброса ${r.count}, демо-гостей ${g.count}`);
}

export function startJobs() {
  const run = () => cleanup().catch((e) => console.error("[jobs]", e.message));
  void run();
  return setInterval(run, 60 * 60 * 1000).unref();
}
