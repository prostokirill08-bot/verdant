import { db } from "./db";
import { GUEST_DOMAIN } from "@/lib/guest";
import { announceTournament, payTournament } from "./promo/service";
import { takeDirty } from "./progress/queue";
import { evaluate } from "./progress/engine";
import { logError } from "./errors";

/** Фоновая уборка: просроченные сессии, ссылки восстановления пароля, старые демо-гости и записи журнала старше 90 дней. Безопасно запускать на любом экземпляре. */
export async function cleanup() {
  const now = new Date();
  const [s, r, a] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordReset.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
    // Журнал действий храним 90 дней — дольше он не нужен для разбора инцидентов
    db.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * 24 * 3600 * 1000) } } }),
  ]);
  // Ошибки храним 30 дней, прочитанные уведомления — 60 дней
  await db.errorLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 24 * 3600 * 1000) } } });
  await db.notification.deleteMany({ where: { readAt: { not: null }, createdAt: { lt: new Date(now.getTime() - 60 * 24 * 3600 * 1000) } } });
  // Демо-гости живут 3 дня; кошелёк, журнал и раунды удаляются каскадом вместе с аккаунтом
  const g = await db.user.deleteMany({ where: { email: { endsWith: `@${GUEST_DOMAIN}` }, createdAt: { lt: new Date(now.getTime() - 3 * 24 * 3600 * 1000) } } });
  if (s.count || r.count || g.count || a.count) console.log(`[jobs] удалено: сессий ${s.count}, ссылок сброса ${r.count}, демо-гостей ${g.count}, старых записей журнала ${a.count}`);
}

export function startJobs() {
  const run = () => {
    cleanup().catch((e) => console.error("[jobs]", e.message));
    // Турнир недели: призы за прошедшую неделю (повторный запуск безопасен)
    payTournament().then((n) => n && console.log(`[jobs] турнир: выплачено призов ${n}`))
      .then(() => announceTournament()).then((n) => n && console.log(`[jobs] турнир: уведомлений о старте ${n}`))
      .catch((e) => { console.error("[jobs] турнир", e.message); void logError({ source: "job", path: "tournament", message: e.message, stack: e.stack }); });
  };
  void run();
  // Очередь прогресса: после ставок проверяем достижения и задания (по одному игроку за раз)
  let busy = false;
  setInterval(async () => {
    if (busy) return; busy = true;
    try {
      for (const id of takeDirty()) {
        try { await evaluate(id); } catch (e) { void logError({ source: "job", path: "progress", message: (e as Error).message, stack: (e as Error).stack, userId: id }); }
      }
    } finally { busy = false; }
  }, 2000).unref();
  return setInterval(run, 15 * 60 * 1000).unref();
}
