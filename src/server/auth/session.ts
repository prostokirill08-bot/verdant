import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import type { Role, UserStatus } from "@prisma/client";
import { db } from "../db";
import { randomToken, sha256 } from "../security/tokens";
import { isHttps } from "../config";

export const SESSION_COOKIE = "vd_session";
export const CSRF_COOKIE = "vd_csrf";
const TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 дней

export type SessionUser = {
  id: string; publicId: string; email: string; username: string; role: Role; status: UserStatus;
  avatar: string; csrfToken: string; sessionId: string;
};

// Secure-cookie включаем, когда сайт работает по HTTPS
const secure = isHttps();

/**
 * embedded — вход из Telegram Mini App. В Telegram Web сайт открыт во фрейме чужого сайта, и обычные cookie
 * (SameSite=Lax/Strict) туда не доходят. Поэтому такие cookie — SameSite=None + Partitioned: они живут
 * только внутри Telegram и не видны другим сайтам. Защиту от CSRF держат проверка Origin и токен в заголовке.
 */
export async function createSession(userId: string, ip: string, userAgent: string | null, opts: { embedded?: boolean } = {}) {
  const token = randomToken(32), csrfToken = randomToken(24);
  await db.session.create({ data: { id: sha256(token), userId, csrfToken, ip, userAgent: userAgent?.slice(0, 300), expiresAt: new Date(Date.now() + TTL_MS) } });
  const jar = await cookies();
  const embed = opts.embedded && secure ? { sameSite: "none" as const, partitioned: true } : null;
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: TTL_MS / 1000, ...embed });
  jar.set(CSRF_COOKIE, csrfToken, { httpOnly: false, sameSite: "strict", secure, path: "/", maxAge: TTL_MS / 1000, ...embed });
}

export async function destroySession(sessionId?: string) {
  if (sessionId) await db.session.deleteMany({ where: { id: sessionId } });
  const jar = await cookies();
  jar.delete(SESSION_COOKIE); jar.delete(CSRF_COOKIE);
}

/** Читает сессию из cookie. В серверных компонентах вызывай без аргумента. */
export async function getSession(req?: NextRequest): Promise<SessionUser | null> {
  const token = req ? req.cookies.get(SESSION_COOKIE)?.value : (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  const u = s.user;
  return { id: u.id, publicId: u.publicId, email: u.email, username: u.username, role: u.role, status: u.status, avatar: u.avatar, csrfToken: s.csrfToken, sessionId: s.id };
}
