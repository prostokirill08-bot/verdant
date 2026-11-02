// Клиентские запросы к API: CSRF-токен из cookie подставляется автоматически.
export class ApiError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }

function csrf(): string {
  if (typeof document === "undefined") return "";
  return document.cookie.split("; ").find((c) => c.startsWith("vd_csrf="))?.slice(8) ?? "";
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.body ? "POST" : "GET");
  const res = await fetch(path, {
    method, credentials: "same-origin",
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(method !== "GET" ? { "x-csrf-token": decodeURIComponent(csrf()) } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Ошибка ${res.status}`, res.status, data.code);
  return data as T;
}
