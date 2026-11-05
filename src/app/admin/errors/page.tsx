"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, Loading, Msg, useAction, useAdminData, useIsAdmin } from "@/components/admin/ui";
import { api } from "@/lib/api";

type E = { id: string; source: string; path: string | null; message: string; stack: string | null; userId: string | null; createdAt: string };

/** Системные ошибки: падения API (500), сбои фоновых задач и ошибки в браузерах игроков. Хранятся 30 дней. */
export default function AdminErrors() {
  const [source, setSource] = useState("");
  const { data, error, reload } = useAdminData<{ items: E[]; last24h: number; total: number }>(`/api/admin/errors${source ? `?source=${source}` : ""}`);
  const admin = useIsAdmin(); const act = useAction(); const [open, setOpen] = useState<string | null>(null);
  if (!data) return <Loading error={error} />;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">{[["", "Все"], ["api", "Сервер (API)"], ["job", "Фоновые задачи"], ["client", "Браузер"]].map(([k, t]) => <button key={k} onClick={() => setSource(k!)} className={`rounded-lg px-3 py-1.5 text-[13px] ${source === k ? "bg-accent text-accent-ink" : "bg-raised text-soft"}`}>{t}</button>)}</div>
        <div className="flex items-center gap-2 text-[13px] text-muted">За сутки: <b className="text-white">{data.last24h}</b> · всего: {data.total}
          {admin && data.total > 0 && <Button variant="ghost" loading={act.busy} onClick={() => { if (confirm("Очистить журнал ошибок?")) void act.run(() => api("/api/admin/errors", { method: "DELETE" }), "Журнал очищен").then((r) => r && reload()); }}>Очистить</Button>}
        </div>
      </div>
      <Msg m={act.msg} />
      {!data.items.length ? <p className="rounded-2xl border border-line bg-panel p-6 text-center text-muted">Ошибок нет 🎉</p> : (
        <ul className="grid gap-2">{data.items.map((e) => (
          <li key={e.id} className="rounded-2xl border border-line bg-panel p-3">
            <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full flex-wrap items-center gap-2 text-left">
              <Badge tone={e.source === "api" ? "danger" : e.source === "job" ? "warn" : "muted"}>{e.source}</Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{e.message}</span>
              <span className="text-[12px] text-muted">{e.path ?? ""} · {new Date(e.createdAt).toLocaleString("ru-RU")}</span>
            </button>
            {open === e.id && e.stack && <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-ink p-3 text-[11.5px] text-soft">{e.stack}</pre>}
          </li>
        ))}</ul>
      )}
    </div>
  );
}
