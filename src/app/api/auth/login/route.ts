import { route, body } from "@/server/http";
import { loginSchema } from "@/server/auth/schemas";
import { checkLogin } from "@/server/auth/service";
import { createSession } from "@/server/auth/session";

export const POST = route({ rate: { key: "login", limit: 10, window: 300 }, csrf: false }, async ({ req, ip }) => {
  const p = await body(req, loginSchema);
  const user = await checkLogin(p.login, p.password, ip);
  await createSession(user.id, ip, req.headers.get("user-agent"));
  return { ok: true, role: user.role };
});
