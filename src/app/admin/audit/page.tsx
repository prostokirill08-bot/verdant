"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/play/kit";
import { Badge, inputCls, Loading, tdCls, thCls } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api";

type Item = { id: string; action: string; actorId: string | null; actor: string | null; targetType: string | null; targetId: string | null; target: string | null; ip: string | null; meta: unknown; createdAt: string };
const GROUPS: [string, string][] = [["", "Все"], ["auth.", "Вход и регистрация"], ["admin.", "Действия админов"], ["wallet.", "Кошелёк"], ["game.", "Игры"], ["fair.", "Сиды"]];
const tone = (a: string) => (a.startsWith("admin.") ? "warn" : a.includes("failed") || a.includes("lockout") || a.includes("block") ? "danger" : a.startsWith("auth.") ? "muted" : "accent") as "warn" | "danger" | "muted" | "accent";

export default function AdminAudit() {
  const [action, setAction] = useState(""); const [custom, setCustom] = useState("");
  const [items, setItems] = useState<Item[] | null>(null); const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(""); const [more, setMore] = useState(false);
  const filter = custom.trim() || action;

  async function load(reset: boolean, cur?: string | null) {
    setError(""); if (reset) setItems(null); else setMore(true);
    try {
      const r = await api<{ items: Item[]; nextCursor: string | null }>(`/api/admin/audit?${new URLSearchParams({ action: filter, cursor: (!reset && cur) || "" })}`);
      setItems((p) => (reset ? r.items : [...(p ?? []), ...r.items])); setCursor(r.nextCursor);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Ошибка"); setItems([]); } finally { setMore(false); }
  }
  useEffect(() => { const t = setTimeout(() => void load(true), 250); return () => clearTimeout(t); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel>
      <div className="grid gap-2 border-b border-line p-4">
        <div className="flex flex-wrap gap-1.5">{GROUPS.map(([k, t]) => <button key={k} onClick={() => { setAction(k); setCustom(""); }} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${!custom && action === k ? "bg-accent text-accent-ink" : "bg-raised text-soft hover:text-white"}`}>{t}</button>)}</div>
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Или начало действия, например admin.wallet" className={`${inputCls} font-mono`} aria-label="Фильтр действия" />
      </div>
      {!items ? <Loading error={error} /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead><tr><th className={thCls}>Когда</th><th className={thCls}>Действие</th><th className={thCls}>Кто</th><th className={thCls}>Над кем</th><th className={thCls}>IP</th><th className={thCls}>Детали</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-line/60 align-top">
                    <td className={`${tdCls} whitespace-nowrap text-muted`}>{new Date(i.createdAt).toLocaleString("ru-RU")}</td>
                    <td className={tdCls}><Badge tone={tone(i.action)}>{i.action}</Badge></td>
                    <td className={tdCls}>{i.actorId ? <Link href={`/admin/users/${i.actorId}`} className="hover:text-accent">{i.actor ?? i.actorId.slice(0, 8)}</Link> : "—"}</td>
                    <td className={tdCls}>{i.targetType === "user" && i.targetId ? <Link href={`/admin/users/${i.targetId}`} className="hover:text-accent">{i.target ?? i.targetId.slice(0, 8)}</Link> : i.target ?? "—"}</td>
                    <td className={`${tdCls} font-mono text-[12.5px] text-soft`}>{i.ip ?? "—"}</td>
                    <td className={`${tdCls} max-w-[280px] break-all font-mono text-[12px] text-muted`}>{i.meta ? JSON.stringify(i.meta).slice(0, 220) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!items.length && <p className="p-8 text-center text-muted">{error || "Записей нет"}</p>}
          {cursor && <div className="p-4 text-center"><Button variant="secondary" loading={more} onClick={() => load(false, cursor)}>Показать ещё</Button></div>}
        </>
      )}
    </Panel>
  );
}
