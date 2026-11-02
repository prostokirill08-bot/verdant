"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [["/admin", "Обзор"], ["/admin/users", "Пользователи"], ["/admin/games", "Игры"], ["/admin/sessions", "Сессии"], ["/admin/audit", "Журнал действий"], ["/admin/settings", "Настройки"]] as const;

export function AdminNav({ role }: { role: string }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-panel p-1" aria-label="Разделы админ-панели" data-role={role}>
      {TABS.map(([h, t]) => {
        const active = h === "/admin" ? path === h : path.startsWith(h);
        return <Link key={h} href={h} className={`whitespace-nowrap rounded-xl px-4 py-2 text-[14px] font-medium transition-colors ${active ? "bg-raised text-white" : "text-muted hover:text-white"}`}>{t}</Link>;
      })}
    </nav>
  );
}
