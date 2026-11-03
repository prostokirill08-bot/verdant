import { route } from "@/server/http";
import { createGuest } from "@/server/auth/service";
import { createSession } from "@/server/auth/session";

// «Демо» без регистрации: временный аккаунт с демо-рублями и сразу вход
export const POST = route({ rate: { key: "guest", limit: 10, window: 3600 }, csrf: false }, async ({ req, ip, user }) => {
  if (user) return { ok: true, existing: true };
  const g = await createGuest(ip);
  await createSession(g.id, ip, req.headers.get("user-agent"));
  return { ok: true };
});
