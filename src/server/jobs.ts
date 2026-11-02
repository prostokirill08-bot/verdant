import { db } from "./db";

/** Фоновая уборка: просроченные сессии и ссылки восстановления пароля. Безопасно запускать на любом экземпляре. */
export async function cleanup() {
  const now = new Date();
  const [s, r] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordReset.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
  ]);
  if (s.count || r.count) console.log(`[jobs] удалено: сессий ${s.count}, ссылок сброса ${r.count}`);
}

export function startJobs() {
  const run = () => cleanup().catch((e) => console.error("[jobs]", e.message));
  void run();
  return setInterval(run, 60 * 60 * 1000).unref();
}
