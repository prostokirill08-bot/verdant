import { createHash, createHmac } from "node:crypto";

/**
 * Минимизация личных данных. Сайт не хранит настоящие IP-адреса и строки браузера:
 * - IP превращается в «метку» — HMAC с секретом сервера. По метке нельзя восстановить адрес,
 *   но можно увидеть, что два аккаунта заходили с одного адреса (против мультиаккаунтов и перебора).
 * - Вместо полного User-Agent хранится только «Chrome · Android».
 * Секрет — DATA_SECRET, а если его нет, производный от DATABASE_URL (он тоже секретный и есть всегда).
 */
const secret = () => createHash("sha256").update(`verdant-privacy:${process.env.DATA_SECRET || process.env.DATABASE_URL || "dev"}`).digest();

export function ipTag(ip: string | null | undefined): string {
  if (!ip || ip === "local") return "local";
  return "ip-" + createHmac("sha256", secret()).update(ip.trim().toLowerCase()).digest("hex").slice(0, 12);
}

export function deviceLabel(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Telegram|TelegramBot|tgWebApp/i.test(ua) ? "Telegram" : /Edg\//.test(ua) ? "Edge" : /YaBrowser/.test(ua) ? "Яндекс" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Браузер";
  return [br, os].filter(Boolean).join(" · ");
}

/** k***@gmail.com — для роли «Поддержка»: видно, что почта есть, но не сама почта. */
export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}

/** Как игрок выглядит в публичных лентах. Сотрудники и игроки с анонимным режимом — «Скрытый игрок». */
export const HIDDEN_NAME = "Скрытый игрок";
export function publicUser(u: { username: string; avatar: string; role?: string; hidden?: boolean }) {
  return u.hidden || (u.role && u.role !== "USER") ? { user: HIDDEN_NAME, avatar: "hidden" } : { user: u.username, avatar: u.avatar };
}
/** Поля пользователя, нужные для publicUser — подставлять в select. */
export const PUBLIC_USER_SELECT = { username: true, avatar: true, role: true, hidden: true } as const;
