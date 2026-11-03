import { createHmac, timingSafeEqual } from "node:crypto";

/** Пользователь Telegram из подписанных данных запуска Mini App. */
export type TgUser = { id: number; first_name: string; last_name?: string; username?: string; language_code?: string; photo_url?: string };
export type InitData = { user: TgUser; authDate: number; startParam?: string };

/**
 * Проверяет подпись initData по правилам Telegram:
 * secret = HMAC_SHA256("WebAppData", token), hash = HMAC_SHA256(secret, строки key=value по алфавиту через \n).
 * Подделать подпись без токена бота нельзя. maxAge — сколько секунд данные считаются свежими.
 */
export function verifyInitData(raw: string, token: string, maxAge = 24 * 3600, now = Date.now()): InitData | null {
  if (!raw || raw.length > 4096 || !token) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete("hash");
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) return null;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > maxAge) return null;
  try {
    const user = JSON.parse(params.get("user") ?? "") as TgUser;
    if (!Number.isSafeInteger(user?.id) || user.id <= 0) return null;
    return { user, authDate, startParam: params.get("start_param") ?? undefined };
  } catch { return null; }
}

/** Подпись initData (нужна тестам: так же подписывает сам Telegram). */
export function signInitData(fields: Record<string, string>, token: string): string {
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
