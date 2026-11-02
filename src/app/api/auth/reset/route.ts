import { route, body } from "@/server/http";
import { resetSchema } from "@/server/auth/schemas";
import { resetPassword } from "@/server/auth/service";

export const POST = route({ rate: { key: "reset", limit: 10, window: 900 }, csrf: false }, async ({ req, ip }) => {
  const p = await body(req, resetSchema);
  await resetPassword(p.token, p.password, ip);
  return { ok: true };
});
