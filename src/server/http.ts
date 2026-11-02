import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import type { Role } from "@prisma/client";
import { getSession, type SessionUser } from "./auth/session";
import { rateLimit } from "./security/rateLimit";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error") { super(message); }
}

export const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";

type Ctx = { req: NextRequest; ip: string; user: SessionUser | null; params: Record<string, string> };
type Opts = {
  auth?: boolean | Role;          // true — нужен вход; "ADMIN"/"SUPPORT" — нужна роль
  csrf?: boolean;                 // по умолчанию для POST/PUT/PATCH/DELETE — да
  rate?: { key: string; limit: number; window: number };
};

const ROLE_RANK: Record<Role, number> = { USER: 0, SUPPORT: 1, ADMIN: 2 };

/** Обёртка API-маршрута: проверки доступа, CSRF, лимит запросов и единый формат ошибок. */
export function route(opts: Opts, handler: (ctx: Ctx) => Promise<unknown>) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const ip = clientIp(req);
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (mutating) {
        // Запросы с чужих сайтов отклоняем по Origin (браузер всегда шлёт его для POST)
        const origin = req.headers.get("origin");
        if (origin && new URL(origin).host !== req.headers.get("host")) throw new HttpError(403, "Запрос с чужого сайта отклонён", "bad_origin");
      }
      if (opts.rate) {
        const r = await rateLimit(`${opts.rate.key}:${ip}`, opts.rate.limit, opts.rate.window);
        if (!r.ok) throw new HttpError(429, `Слишком много запросов. Подожди ${r.retryAfter} с.`, "rate_limited");
      }
      const user = await getSession(req);
      if (opts.auth) {
        if (!user) throw new HttpError(401, "Нужно войти в аккаунт", "unauthorized");
        if (user.status === "BLOCKED") throw new HttpError(403, "Аккаунт заблокирован", "blocked");
        if (typeof opts.auth === "string" && ROLE_RANK[user.role] < ROLE_RANK[opts.auth]) throw new HttpError(403, "Недостаточно прав", "forbidden");
      }
      if (mutating && user && opts.csrf !== false) {
        if (req.headers.get("x-csrf-token") !== user.csrfToken) throw new HttpError(403, "Сессия устарела, обнови страницу", "csrf");
      }
      const data = await handler({ req, ip, user, params: await ctx.params });
      return data instanceof NextResponse ? data : json(data ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      if (e instanceof ZodError) return json({ error: e.issues[0]?.message ?? "Неверные данные", code: "validation" }, 400);
      console.error("[api]", req.method, req.nextUrl.pathname, e);
      return json({ error: "Внутренняя ошибка сервера", code: "internal" }, 500);
    }
  };
}

/** JSON с поддержкой bigint (суммы отдаём строками). */
export function json(data: unknown, status = 200) {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  return new NextResponse(body, { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export async function body<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const raw = await req.json().catch(() => { throw new HttpError(400, "Тело запроса должно быть JSON", "bad_json"); });
  return schema.parse(raw);
}
