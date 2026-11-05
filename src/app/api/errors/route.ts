import { z } from "zod";
import { body, route } from "@/server/http";
import { logError } from "@/server/errors";
import { db } from "@/server/db";

const input = z.object({ message: z.string().min(1).max(500), path: z.string().max(300).optional(), stack: z.string().max(4000).optional() });

/** Отчёт об ошибке из браузера (для раздела «Ошибки» в админке). Без CSRF — может прийти до входа; строгий лимит. */
export const POST = route({ csrf: false, rate: { key: "client-err", limit: 10, window: 60 } }, async ({ req, user }) => {
  const b = await body(req, input);
  // Защита от засорения журнала: не больше 300 ошибок браузера в час на всю платформу
  if ((await db.errorLog.count({ where: { source: "client", createdAt: { gte: new Date(Date.now() - 3600_000) } } })) >= 300) return { ok: true, dropped: true };
  await logError({ source: "client", message: b.message, path: b.path, stack: b.stack, userId: user?.id });
  return { ok: true };
});
