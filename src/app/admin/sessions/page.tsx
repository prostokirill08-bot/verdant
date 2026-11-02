"use client";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/play/kit";
import { Loading, Msg, roleBadge, tdCls, thCls, useAction, useAdminData } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";

type S = { ref: string; ip: string | null; userAgent: string | null; createdAt: string; expiresAt: string; user: { id: string; username: string; publicId: string; role: string; avatar: string } };

/** Краткое имя устройства из User-Agent. */
function device(ua: string | null) {
  if (!ua) return "—";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /YaBrowser/.test(ua) ? "Яндекс" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : ua.slice(0, 24);
  return [br, os].filter(Boolean).join(" · ");
}

export default function AdminSessions() {
  const { data, error, reload } = useAdminData<{ sessions: S[] }>("/api/admin/sessions");
  const act = useAction();
  if (!data) return <Loading error={error} />;
  const revoke = (ref: string) => act.run(() => api(`/api/admin/sessions/${ref}`, { method: "DELETE" }), "Сессия завершена").then((r) => r && reload());
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 border-b border-line p-4">
        <h2 className="font-semibold">Активные сессии · {data.sessions.length}</h2>
        <Button variant="secondary" size="sm" onClick={reload}>Обновить</Button>
      </div>
      {act.msg && <div className="p-3"><Msg m={act.msg} /></div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[14px]">
          <thead><tr><th className={thCls}>Пользователь</th><th className={thCls}>Устройство</th><th className={thCls}>IP</th><th className={thCls}>Вход</th><th className={thCls}>Истекает</th><th className={thCls} /></tr></thead>
          <tbody>
            {data.sessions.map((s) => (
              <tr key={s.ref} className="border-t border-line/60">
                <td className={tdCls}><Link href={`/admin/users/${s.user.id}`} className="flex items-center gap-2 hover:text-accent"><Avatar name={s.user.username} avatar={s.user.avatar} size={24} />{s.user.username} {roleBadge(s.user.role)}</Link></td>
                <td className={`${tdCls} text-soft`} title={s.userAgent ?? ""}>{device(s.userAgent)}</td>
                <td className={`${tdCls} font-mono text-[13px] text-soft`}>{s.ip ?? "—"}</td>
                <td className={`${tdCls} text-muted`}>{timeAgo(s.createdAt)}</td>
                <td className={`${tdCls} text-muted`}>{new Date(s.expiresAt).toLocaleDateString("ru-RU")}</td>
                <td className={`${tdCls} text-right`}><Button size="sm" variant="danger" onClick={() => revoke(s.ref)} disabled={act.busy}>Завершить</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
