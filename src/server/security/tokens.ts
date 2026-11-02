import { createHash, createHmac, randomBytes } from "node:crypto";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hmac = (key: string, msg: string) => createHmac("sha256", key).update(msg).digest("hex");

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // без 0/O/1/I
/** Видимый ID игрока: VRD-XXXXXX (32^6 ≈ 1 млрд вариантов). */
export function publicId(): string {
  const b = randomBytes(6);
  return "VRD-" + Array.from(b, (x) => ALPHABET[x % 32]).join("");
}
