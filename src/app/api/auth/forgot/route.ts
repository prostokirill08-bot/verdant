import { route, body } from "@/server/http";
import { forgotSchema } from "@/server/auth/schemas";
import { requestReset } from "@/server/auth/service";

export const POST = route({ rate: { key: "forgot", limit: 3, window: 900 }, csrf: false }, async ({ req, ip }) => {
  const { email } = await body(req, forgotSchema);
  await requestReset(email, ip);
  return { ok: true, message: "Если такой email зарегистрирован, мы отправили на него ссылку для восстановления." };
});
