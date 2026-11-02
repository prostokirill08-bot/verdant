"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [["/account", "Обзор"], ["/account/history", "История операций"], ["/account/settings", "Настройки"]] as const;
export function AccountNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-panel p-1" aria-label="Разделы кабинета">
      {TABS.map(([h, t]) => (
        <Link key={h} href={h} className={`whitespace-nowrap rounded-xl px-4 py-2 text-[14px] font-medium transition-colors ${path === h ? "bg-raised text-white" : "text-muted hover:text-white"}`}>{t}</Link>
      ))}
    </nav>
  );
}
