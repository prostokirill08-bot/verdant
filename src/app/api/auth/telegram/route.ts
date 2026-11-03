import { z } from "zod";
import { body, HttpError, route } from "@/server/http";
import { createSession, destroySession } from "@/server/auth/session";
import { botToken } from "@/server/telegram/bot";
import { verifyInitData } from "@/server/telegram/initData";
import { telegramAccount } from "@/server/telegram/auth";

const schema = z.object({ initData: z.string().min(1).max(4096) });

// Вход из Telegram Mini App: подпись initData проверяется токеном бота, пароль не нужен
export const POST = route({ rate: { key: "tg", limit: 30, window: 600 }, csrf: false }, async ({ req, ip, user }) => {
  if (!botToken()) throw new HttpError(404, "Вход через Telegram не настроен", "tg_disabled");
  const { initData } = await body(req, schema);
  const data = verifyInitData(initData, botToken());
  if (!data) throw new HttpError(401, "Данные Telegram не прошли проверку — открой игру заново из бота", "tg_bad_signature");
  const { user: acc, created } = await telegramAccount(data.user, user, ip);
  if (user?.id === acc.id) return { ok: true, created: false, same: true };
  if (user) await destroySession(user.sessionId);
  await createSession(acc.id, ip, req.headers.get("user-agent"), { embedded: true });
  return { ok: true, created };
});
