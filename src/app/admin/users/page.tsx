"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/play/kit";
import { inputCls, Loading, roleBadge, statusBadge, tdCls, thCls } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api";
import { points, timeAgo } from "@/lib/format";

type U = { id: string; publicId: string; email: string; username: string; role: string; status: string; avatar: string; createdAt: string; lastLoginAt: string | null; balance: string };

export default function AdminUsers() {
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [role, setRole] = useState("");
  const [rows, setRows] = useState<U[] | null>(null); const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(""); const [more, setMore] = useState(false);

  async function load(reset: boolean, cur?: string | null) {
    setError(""); if (reset) setRows(null); else setMore(true);
    const qs = new URLSearchParams({ q: q.trim(), status, role, cursor: (!reset && cur) || "" });
    try {
      const r = await api<{ users: U[]; nextCursor: string | null }>(`/api/admin/users?${qs}`);
      setRows((p) => (reset ? r.users : [...(p ?? []), ...r.users])); setCursor(r.nextCursor);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Ошибка"); setRows([]); } finally { setMore(false); }
  }
  // Поиск с небольшой задержкой после ввода
  useEffect(() => { const t = setTimeout(() => void load(true), 250); return () => clearTimeout(t); }, [q, status, role]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel>
      <div className="grid gap-2 border-b border-line p-4 sm:grid-cols-[1fr_160px_160px]">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: email, ник или VRD-ID" className={inputCls} aria-label="Поиск" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls} aria-label="Статус"><option value="">Все статусы</option><option value="ACTIVE">Активные</option><option value="BLOCKED">Заблокированные</option></select>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls} aria-label="Роль"><option value="">Все роли</option><option value="USER">Игроки</option><option value="SUPPORT">Поддержка</option><option value="ADMIN">Админы</option></select>
      </div>
      {!rows ? <Loading error={error} /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead><tr><th className={thCls}>Пользователь</th><th className={thCls}>Email</th><th className={thCls}>Роль</th><th className={thCls}>Статус</th><th className={`${thCls} text-right`}>Баланс</th><th className={`${thCls} text-right`}>Вход</th></tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t border-line/60 hover:bg-raised/40">
                    <td className={tdCls}><Link href={`/admin/users/${u.id}`} className="flex items-center gap-2.5 hover:text-accent"><Avatar name={u.username} avatar={u.avatar} size={28} /><span><span className="block font-medium">{u.username}</span><span className="font-mono text-[12px] text-muted">{u.publicId}</span></span></Link></td>
                    <td className={`${tdCls} text-soft`}>{u.email}</td>
                    <td className={tdCls}>{roleBadge(u.role)}</td>
                    <td className={tdCls}>{statusBadge(u.status)}</td>
                    <td className={`${tdCls} text-right font-mono`}>{points(u.balance)}</td>
                    <td className={`${tdCls} text-right text-muted`}>{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p className="p-8 text-center text-muted">{error || "Никого не найдено"}</p>}
          {cursor && <div className="p-4 text-center"><Button variant="secondary" loading={more} onClick={() => load(false, cursor)}>Показать ещё</Button></div>}
        </>
      )}
    </Panel>
  );
}
