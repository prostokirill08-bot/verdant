import { route, body } from "@/server/http";
import { registerSchema } from "@/server/auth/schemas";
import { registerUser } from "@/server/auth/service";
import { createSession } from "@/server/auth/session";

export const POST = route({ rate: { key: "register", limit: 5, window: 3600 }, csrf: false }, async ({ req, ip }) => {
  const p = await body(req, registerSchema);
  const user = await registerUser(p, ip);
  await createSession(user.id, ip, req.headers.get("user-agent"));
  return { ok: true };
});
