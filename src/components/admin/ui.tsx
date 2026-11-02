"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { api, ApiError } from "@/lib/api";

/** Загрузка данных админ-API с состоянием ошибки и перезагрузкой. */
export function useAdminData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError("");
    try { setData(await api<T>(path)); } catch (e) { setError(e instanceof ApiError ? e.message : "Нет связи с сервером"); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Действие админа: вызов API с блокировкой кнопки и текстом результата. */
export function useAction() {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okText: string): Promise<T | null> => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg({ ok: true, text: okText }); return r; }
    catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Ошибка" }); return null; }
    finally { setBusy(false); }
  }, []);
  return { run, busy, msg, setMsg };
}

export const useIsAdmin = () => useAuth().user?.role === "ADMIN";

export function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return <p role="status" className={`rounded-xl px-3 py-2 text-[13px] ${m.ok ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"}`}>{m.text}</p>;
}

export function Loading({ error }: { error?: string }) {
  if (error) return <p className="rounded-2xl bg-danger/10 p-4 text-danger">{error}</p>;
  return <div className="grid h-40 place-items-center"><span className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>;
}

export const Badge = ({ children, tone = "muted" }: { children: React.ReactNode; tone?: "accent" | "danger" | "warn" | "muted" }) => {
  const c = { accent: "bg-accent/15 text-accent", danger: "bg-danger/15 text-danger", warn: "bg-warn/15 text-warn", muted: "bg-raised text-soft" }[tone];
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold ${c}`}>{children}</span>;
};
export const roleBadge = (r: string) => <Badge tone={r === "ADMIN" ? "warn" : r === "SUPPORT" ? "accent" : "muted"}>{r === "ADMIN" ? "Админ" : r === "SUPPORT" ? "Поддержка" : "Игрок"}</Badge>;
export const statusBadge = (s: string) => <Badge tone={s === "BLOCKED" ? "danger" : "accent"}>{s === "BLOCKED" ? "Заблокирован" : "Активен"}</Badge>;
export const inputCls = "h-10 w-full min-w-0 rounded-xl border border-line bg-ink px-3 text-[14px] outline-none focus:border-accent disabled:opacity-60";
export const thCls = "px-4 py-2.5 text-left text-[12px] font-medium uppercase tracking-wider text-muted";
export const tdCls = "px-4 py-2.5";
