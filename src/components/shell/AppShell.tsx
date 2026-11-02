"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { GameIcon } from "@/components/games/GameIcon";
import { GAME_NAMES, GAME_SLUGS } from "@/lib/games";
import { points } from "@/lib/format";
import { api } from "@/lib/api";
import { Logo } from "./Logo";

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active: boolean }) {
  return (
    <Link href={href} className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors ${active ? "bg-raised text-white" : "text-muted hover:bg-raised/60 hover:text-white"}`}>
      {children}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, balance, loading, refresh } = useAuth();
  const [menu, setMenu] = useState(false);
  const [platform, setPlatform] = useState<{ announcement: string; maintenance: boolean } | null>(null);
  useEffect(() => { api<{ announcement: string; maintenance: boolean }>("/api/platform").then(setPlatform).catch(() => {}); }, [path]);

  async function logout() {
    setMenu(false);
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    await refresh(); router.push("/"); router.refresh();
  }

  return (
    <div className="flex min-h-dvh">
      {/* Боковая панель (компьютер) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-line bg-panel px-3 py-5 lg:flex">
        <div className="px-2"><Logo /></div>
        <nav className="grid gap-1">
          <NavLink href="/" active={path === "/"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 11 12 4l8 7v9H4z" /></svg>Главная
          </NavLink>
          <NavLink href="/games" active={path === "/games"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>Все игры
          </NavLink>
          <NavLink href="/fair" active={path === "/fair"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" /><path d="m9 12 2 2 4-4" /></svg>Честность
          </NavLink>
        </nav>
        <div className="grid gap-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted/70">Игры</p>
          {GAME_SLUGS.map((s) => (
            <NavLink key={s} href={`/games/${s}`} active={path === `/games/${s}`}><GameIcon slug={s} size={18} />{GAME_NAMES[s]}</NavLink>
          ))}
        </div>
        {user && (
          <div className="grid gap-1">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted/70">Аккаунт</p>
            <NavLink href="/account" active={path === "/account"}>Кабинет</NavLink>
            <NavLink href="/account/history" active={path === "/account/history"}>История операций</NavLink>
            <NavLink href="/account/settings" active={path === "/account/settings"}>Настройки</NavLink>
            {user.role !== "USER" && <NavLink href="/admin" active={path.startsWith("/admin")}>Админ-панель</NavLink>}
          </div>
        )}
        <p className="mt-auto px-3 text-[11.5px] leading-relaxed text-muted/70">Демо-платформа. Только виртуальные баллы — их нельзя купить или вывести.</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Верхняя панель */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-ink/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="lg:hidden"><Logo /></div>
          <div className="ml-auto flex items-center gap-2">
            {loading ? <span className="h-9 w-40 animate-pulse rounded-xl bg-panel" /> : user ? (
              <>
                <Link href="/account" className="flex h-10 items-center gap-2 rounded-xl border border-line bg-panel pl-3 pr-1.5 hover:border-accent/50" title="Демо-баланс">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Баллы</span>
                  <motion.span key={balance} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-[15px] font-semibold tabular">{points(balance)}</motion.span>
                  <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-ink" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M12 5v14M5 12h14" /></svg>
                  </span>
                </Link>
                <div className="relative">
                  <button onClick={() => setMenu((v) => !v)} className="rounded-full focus-visible:outline-2 focus-visible:outline-accent" aria-haspopup="menu" aria-expanded={menu} aria-label="Меню аккаунта">
                    <Avatar name={user.username} avatar={user.avatar} />
                  </button>
                  <AnimatePresence>
                    {menu && (
                      <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
                        className="absolute right-0 top-12 w-56 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl">
                        <div className="px-3 py-2"><p className="font-semibold">{user.username}</p><p className="font-mono text-[12px] text-muted">{user.publicId}</p></div>
                        {[["/account", "Кабинет"], ["/account/history", "История операций"], ["/account/settings", "Настройки"], ...(user.role !== "USER" ? [["/admin", "Админ-панель"]] : [])].map(([h, t]) => (
                          <Link key={h} href={h!} onClick={() => setMenu(false)} role="menuitem" className="block rounded-xl px-3 py-2 text-[14px] text-soft hover:bg-raised hover:text-white">{t}</Link>
                        ))}
                        <button onClick={logout} role="menuitem" className="w-full rounded-xl px-3 py-2 text-left text-[14px] text-danger hover:bg-raised">Выйти</button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <>
                <Link href="/login"><Button variant="ghost">Войти</Button></Link>
                <Link href="/register"><Button>Регистрация</Button></Link>
              </>
            )}
          </div>
        </header>

        {platform?.maintenance && <p className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-center text-[13.5px] text-warn" role="status">Идут технические работы — ставки временно недоступны.</p>}
        {platform?.announcement && <p className="border-b border-accent/20 bg-accent/10 px-4 py-2 text-center text-[13.5px] text-accent" role="status">{platform.announcement}</p>}
        <main className="mx-auto w-full min-w-0 max-w-[1240px] flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">{children}</main>
      </div>

      {/* Нижняя навигация (телефон) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Навигация">
        {[["/", "Главная"], ["/games", "Игры"], [user ? "/account" : "/login", user ? "Кабинет" : "Вход"], [user ? "/account/history" : "/register", user ? "История" : "Регистрация"]].map(([h, t]) => (
          <Link key={t} href={h!} className={`py-3 text-center text-[12px] font-medium ${path === h ? "text-accent" : "text-muted"}`}>{t}</Link>
        ))}
      </nav>
    </div>
  );
}
