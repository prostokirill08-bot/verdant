import { timingSafeEqual } from "node:crypto";
import { HttpError, route } from "@/server/http";
import { botToken, handleMessage, webhookSecret } from "@/server/telegram/bot";

// Обновления от Telegram. Принимаем только с секретом, который сервер сам передал в setWebhook.
export const POST = route({ csrf: false }, async ({ req }) => {
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(webhookSecret());
  if (!botToken() || got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, "Нет доступа", "unauthorized");
  const upd = (await req.json().catch(() => ({}))) as { message?: Parameters<typeof handleMessage>[0] };
  // Ошибку отправки только пишем в журнал: иначе Telegram будет бесконечно повторять то же обновление
  if (upd.message) await handleMessage(upd.message).catch((e) => console.error("[telegram]", (e as Error).message));
  return { ok: true };
});
