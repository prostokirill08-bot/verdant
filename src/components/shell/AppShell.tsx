"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import { GAMES, GAME_SLUGS } from "@/lib/games";
import { points } from "@/lib/format";
import { api } from "@/lib/api";
import { OnlineBadge } from "./OnlineBadge";
import { KeysBadge } from "./KeysBadge";
import { useGameModal } from "@/components/games/GameModal";
import { isGuestEmail } from "@/lib/guest";
import { TelegramLink } from "./TelegramLink";
import { SoundIcon, useSound } from "@/components/ui/SoundToggle";
import { setSound } from "@/lib/sound";
import { Logo } from "./Logo";
import { NotificationBell } from "./Notifications";

function NavLink({ href, children, active, onClick }: { href: string; children: React.ReactNode; active: boolean; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <Link href={href} onClick={onClick} className={`group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-all duration-200 ${active ? "nav-active text-white" : "text-muted hover:bg-white/[.045] hover:text-white"}`}>
      {children}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, balance, loading, refresh } = useAuth();
  const [menu, setMenu] = useState(false);
  const { open: openGame } = useGameModal();
  const guest = isGuestEmail(user?.email);
  const sound = useSound();
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
      <aside className="sidebar-shell sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/[.07] px-3 py-5 backdrop-blur-xl lg:flex">
        <div className="px-2"><Logo /></div>
        <nav className="grid gap-1">
          <NavLink href="/" active={path === "/"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 11 12 4l8 7v9H4z" /></svg>Главная
          </NavLink>
          <NavLink href="/games" active={path === "/games"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>Все игры
          </NavLink>
          <NavLink href="/bonuses" active={path === "/bonuses"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="9" width="18" height="12" rx="2" /><path d="M12 9v12M3 13h18M12 9C10 5 6 5 7 8c.6 1.5 5 1 5 1zm0 0c2-4 6-4 5-1-.6 1.5-5 1-5 1z" /></svg>Бонусы и турнир
          </NavLink>
          <NavLink href="/leaderboard" active={path.startsWith("/leaderboard")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></svg>Рейтинг
          </NavLink>
          <NavLink href="/fair" active={path === "/fair"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" /><path d="m9 12 2 2 4-4" /></svg>Честность
          </NavLink>
        </nav>
        <div className="grid gap-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted/70">Игры</p>
          {GAME_SLUGS.map((s) => (
            <NavLink key={s} href={`/games/${s}`} active={path === `/games/${s}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || path === `/games/${s}`) return; e.preventDefault(); openGame(s); }}>
              <Image src={GAMES[s].cover} alt="" width={22} height={28} className="h-7 w-[22px] rounded-md object-cover ring-1 ring-white/10" />
              <span className="truncate">{GAMES[s].name}</span>
              {GAMES[s].badge === "Новинка" && <span className="ml-auto rounded-md bg-brand/20 px-1.5 text-[10px] font-bold uppercase text-gold">new</span>}
            </NavLink>
          ))}
        </div>
        {user && (
          <div className="grid gap-1">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted/70">Аккаунт</p>
            <NavLink href="/account" active={path === "/account"}>Профиль</NavLink>
            <NavLink href="/account/achievements" active={path === "/account/achievements"}>Достижения</NavLink>
            <NavLink href="/account/quests" active={path === "/account/quests"}>Задания дня</NavLink>
            <NavLink href="/deposit" active={path === "/deposit"}>Демо-рубли</NavLink>
            <NavLink href="/account/history" active={path === "/account/history"}>История</NavLink>
            <NavLink href="/account/settings" active={path === "/account/settings"}>Настройки</NavLink>
            {user.role !== "USER" && <NavLink href="/admin" active={path.startsWith("/admin")}>Админ-панель</NavLink>}
          </div>
        )}
        <div className="mt-auto"><TelegramLink variant="side" /></div>
        <p className="px-3 text-[11.5px] leading-relaxed text-muted/70">🎄 С наступающим! Демо-платформа: только виртуальные демо-рубли — их нельзя купить или вывести.</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Верхняя панель */}
        <header className="topbar-shell sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-white/[.07] px-4 backdrop-blur-xl sm:px-6">
          <div className="garland absolute inset-x-0 -bottom-[14px]" aria-hidden />
          <div className="shrink-0 lg:hidden"><Logo compact /></div>
          <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
            <span className={user ? "hidden sm:block" : ""}><OnlineBadge /></span>
            <KeysBadge />
            {loading ? <span className="h-9 w-40 animate-pulse rounded-xl bg-panel" /> : user ? (
              <>
                <div className="balance-chip flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/10 pl-2.5 pr-1.5 sm:pl-3">
                  <Link href="/account/history" className="flex min-w-0 items-center gap-2" title="Баланс">
                    <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted sm:inline">Баланс</span>
                    <motion.span key={balance} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-[14px] font-semibold tabular min-[400px]:text-[15px]">{points(balance)}</motion.span>
                  </Link>
                  <Link href="/deposit" className="grid size-7 place-items-center max-[400px]:hidden rounded-lg bg-[linear-gradient(180deg,#ff5f6f,#d4183a)] text-white hover:brightness-110" aria-label="Получить демо-рубли" title="Демо-рубли" data-testid="deposit-plus">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                  </Link>
                </div>
                <NotificationBell />
                <div className="relative">
                  <button onClick={() => setMenu((v) => !v)} className="rounded-full focus-visible:outline-2 focus-visible:outline-accent" aria-haspopup="menu" aria-expanded={menu} aria-label="Меню аккаунта">
                    <Avatar name={user.username} avatar={user.avatar} />
                  </button>
                  <AnimatePresence>
                    {menu && (
                      <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
                        className="absolute right-0 top-12 w-56 rounded-2xl border border-line bg-panel p-1.5 shadow-2xl">
                        <div className="px-3 py-2"><p className="font-semibold">{user.username}</p><p className="font-mono text-[12px] text-muted">{user.publicId}</p></div>
                        {[["/account", "Профиль"], ["/account/achievements", "Достижения"], ["/account/quests", "Задания дня"], ["/deposit", "Демо-рубли"], ["/account/history", "История"], ["/account/settings", "Настройки"], ...(user.role !== "USER" ? [["/admin", "Админ-панель"]] : [])].map(([h, t]) => (
                          <Link key={h} href={h!} onClick={() => setMenu(false)} role="menuitem" className="block rounded-xl px-3 py-2 text-[14px] text-soft hover:bg-raised hover:text-white">{t}</Link>
                        ))}
                        <button onClick={() => setSound(!sound.on)} role="menuitemcheckbox" aria-checked={sound.on} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[14px] text-soft hover:bg-raised hover:text-white">Звук <span className={`flex items-center gap-1.5 text-[12.5px] ${sound.on ? "text-accent" : "text-muted"}`}><SoundIcon on={sound.on} />{sound.on ? "вкл" : "выкл"}</span></button>
                        <button onClick={logout} role="menuitem" className="w-full rounded-xl px-3 py-2 text-left text-[14px] text-danger hover:bg-raised">Выйти</button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <>
                <Link href="/login"><Button variant="ghost" className="!px-2.5 sm:!px-4">Войти</Button></Link>
                <Link href="/register"><Button className="!px-3 sm:!px-4"><span className="sm:hidden">Начать</span><span className="hidden sm:inline">Регистрация</span></Button></Link>
              </>
            )}
          </div>
        </header>

        {platform?.maintenance && <p className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-center text-[13.5px] text-warn" role="status">Идут технические работы — ставки временно недоступны.</p>}
        {guest && (
          <p className="border-b border-gold/25 bg-gold/10 px-4 py-2 text-center text-[13px] text-gold" data-testid="guest-bar">
            Демо-гость: баланс хранится 3 дня. <Link href="/register" className="font-semibold underline underline-offset-2">Зарегистрируйся</Link>, чтобы сохранить игру.
          </p>
        )}
        {platform?.announcement && <p className="border-b border-accent/20 bg-accent/10 px-4 py-2 text-center text-[13.5px] text-accent" role="status">{platform.announcement}</p>}
        <main className="mx-auto w-full min-w-0 max-w-[1240px] flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">{children}</main>
      </div>

      {/* Нижняя навигация (телефон) */}
      <nav className="mobile-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-white/10 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Навигация">
        {([["/", "Главная", "M4 11 12 4l8 7v9H4z"], ["/games", "Игры", "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"], ["/bonuses", "Бонусы", "M3 9h18v12H3zM12 9v12M3 13h18M12 9C10 5 6 5 7 8c.6 1.5 5 1 5 1zm0 0c2-4 6-4 5-1-.6 1.5-5 1-5 1z"], [user ? "/account" : "/login", user ? "Кабинет" : "Вход", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"], [user ? "/leaderboard" : "/register", user ? "Рейтинг" : "Регистрация", user ? "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" : "M12 7v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"]] as const).map(([h, t, d]) => {
          const active = h === "/" ? path === "/" : path.startsWith(h);
          return (
            <Link key={t} href={h} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden><path d={d} /></svg>{t}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
