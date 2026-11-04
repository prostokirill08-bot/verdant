import { db } from "./db";
import { GUEST_DOMAIN } from "@/lib/guest";
import { payTournament } from "./promo/service";

/** Фоновая уборка: просроченные сессии, ссылки восстановления пароля, старые демо-гости и записи журнала старше 90 дней. Безопасно запускать на любом экземпляре. */
export async function cleanup() {
  const now = new Date();
  const [s, r, a] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordReset.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
    // Журнал действий храним 90 дней — дольше он не нужен для разбора инцидентов
    db.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * 24 * 3600 * 1000) } } }),
  ]);
  // Демо-гости живут 3 дня; кошелёк, журнал и раунды удаляются каскадом вместе с аккаунтом
  const g = await db.user.deleteMany({ where: { email: { endsWith: `@${GUEST_DOMAIN}` }, createdAt: { lt: new Date(now.getTime() - 3 * 24 * 3600 * 1000) } } });
  if (s.count || r.count || g.count || a.count) console.log(`[jobs] удалено: сессий ${s.count}, ссылок сброса ${r.count}, демо-гостей ${g.count}, старых записей журнала ${a.count}`);
}

export function startJobs() {
  const run = () => {
    cleanup().catch((e) => console.error("[jobs]", e.message));
    // Турнир недели: призы за прошедшую неделю (повторный запуск безопасен)
    payTournament().then((n) => n && console.log(`[jobs] турнир: выплачено призов ${n}`)).catch((e) => console.error("[jobs] турнир", e.message));
  };
  void run();
  return setInterval(run, 15 * 60 * 1000).unref();
}
