"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { sfx } from "@/lib/sound";

export type Notice = { id: string; kind: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };
const KIND_ICON: Record<string, string> = {
  achievement: "M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8",
  quest: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  tournament_start: "M4 21V4M4 4h12l-2 4 2 4H4",
  tournament_end: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z",
  daily_bonus: "M3 9h18v12H3zM12 9v12M3 13h18",
  system: "M12 8v5M12 16h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
};
const Icon = ({ kind }: { kind: string }) => (
  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/25" aria-hidden>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={KIND_ICON[kind] ?? KIND_ICON.system} /></svg>
  </span>
);

/** Список уведомлений с отметкой прочитанного (в выпадающем меню и на отдельной странице). */
export function NotificationList({ full, onChange, onNavigate }: { full?: boolean; onChange?: (unread: number) => void; onNavigate?: () => void }) {
  const [items, setItems] = useState<Notice[] | null>(null); const [cursor, setCursor] = useState<string | null>(null); const [unread, setUnread] = useState(0);
  const load = useCallback(async (cur?: string | null) => {
    const r = await api<{ unread: number; items: Notice[]; nextCursor: string | null }>(`/api/notifications${cur ? `?cursor=${cur}` : ""}`);
    setItems((prev) => (cur ? [...(prev ?? []), ...r.items] : r.items)); setCursor(r.nextCursor); setUnread(r.unread); onChange?.(r.unread);
  }, [onChange]);
  useEffect(() => { load().catch(() => setItems([])); }, [load]);
  async function mark(body: { all: true } | { ids: string[] }) {
    const r = await api<{ unread: number }>("/api/notifications/read", { body });
    setItems((prev) => prev?.map((n) => ("all" in body || body.ids.includes(n.id) ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)) ?? null);
    setUnread(r.unread); onChange?.(r.unread);
  }
  if (!items) return <div className="grid h-24 place-items-center"><span className="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>;
  const shown = full ? items : items.slice(0, 8);
  return (
    <div className="grid gap-2" data-testid="notification-list">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className={full ? "font-display text-[20px] font-bold" : "text-[13px] font-semibold text-soft"}>Уведомления{unread ? ` · ${unread} новых` : ""}</p>
        {unread > 0 && <button onClick={() => mark({ all: true })} className="text-[12.5px] font-semibold text-accent hover:underline" data-testid="mark-all-read">Прочитать все</button>}
      </div>
      {!shown.length && <p className="px-1 py-6 text-center text-[13.5px] text-muted">Пока тихо. Здесь появятся достижения, задания, турниры и награды.</p>}
      <ul className="grid gap-1">
        {shown.map((n) => {
          const inner = (
            <>
              <Icon kind={n.kind} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><span className="truncate text-[13.5px] font-semibold">{n.title}</span>{!n.readAt && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Не прочитано" />}</span>
                <span className="block text-[12.5px] leading-snug text-muted">{n.body}</span>
                <span className="block text-[11px] text-muted/70" title={new Date(n.createdAt).toLocaleString("ru-RU")}>{timeAgo(n.createdAt)}</span>
              </span>
            </>
          );
          const cls = `flex w-full gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-white/[.04] ${n.readAt ? "" : "bg-accent/[.05]"}`;
          const read = () => { if (!n.readAt) void mark({ ids: [n.id] }); onNavigate?.(); };
          return <li key={n.id}>{n.link ? <Link href={n.link} onClick={read} className={cls}>{inner}</Link> : <button type="button" onClick={read} className={cls}>{inner}</button>}</li>;
        })}
      </ul>
      {full && cursor && <button onClick={() => load(cursor)} className="mx-auto rounded-xl bg-raised px-4 py-2 text-[13px] text-soft hover:text-white">Показать ещё</button>}
      {!full && <Link href="/account/notifications" onClick={onNavigate} className="rounded-xl px-2 py-2 text-center text-[13px] font-semibold text-accent hover:bg-white/[.04]">Все уведомления</Link>}
    </div>
  );
}

/**
 * Колокольчик в шапке: число непрочитанных (опрос раз в 30 секунд и при переходах) и выпадающий центр уведомлений.
 * Когда приходит новое уведомление, на 5 секунд показывается всплывающая плашка.
 */
export function NotificationBell() {
  const { user } = useAuth(); const path = usePathname();
  const [unread, setUnread] = useState(0); const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notice | null>(null);
  const last = useRef<number | null>(null); const box = useRef<HTMLDivElement>(null);
  const poll = useCallback(async () => {
    if (!user || document.hidden) return;
    try {
      const r = await api<{ unread: number }>("/api/notifications?count=1");
      if (last.current !== null && r.unread > last.current) {
        const l = await api<{ items: Notice[] }>("/api/notifications");
        const fresh = l.items.find((n) => !n.readAt);
        if (fresh) { setToast(fresh); sfx("bonus"); setTimeout(() => setToast((t) => (t?.id === fresh.id ? null : t)), 5000); }
      }
      last.current = r.unread; setUnread(r.unread);
    } catch { /* сеть */ }
  }, [user]);
  useEffect(() => { last.current = null; void poll(); const t = setInterval(poll, 30_000); return () => clearInterval(t); }, [poll]);
  useEffect(() => { const t = setTimeout(poll, 2500); setOpen(false); return () => clearTimeout(t); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!user) return null;
  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open} aria-label={`Уведомления${unread ? `: ${unread} новых` : ""}`} data-testid="bell"
        className="relative grid size-9 shrink-0 place-items-center rounded-xl border sm:size-10 border-white/[.09] bg-white/[.035] text-soft hover:border-accent/50 hover:text-white">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-[#ff5c70] px-1 text-[10.5px] font-bold leading-[18px] text-white" data-testid="bell-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label="Уведомления" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
            className="glass-panel fixed inset-x-3 top-[70px] z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1633] p-2 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]">
            <NotificationList onChange={(n) => { setUnread(n); last.current = n; }} onNavigate={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} role="status" data-testid="notice-toast"
            className="fixed inset-x-3 top-[74px] z-[60] mx-auto flex max-w-sm gap-3 rounded-2xl border border-accent/40 bg-[#0f1633]/95 p-3 shadow-[0_20px_50px_-20px_#000,0_0_30px_-12px_#3ee08f] backdrop-blur sm:left-auto sm:right-6 sm:mx-0">
            <Icon kind={toast.kind} />
            <Link href={toast.link ?? "/account/notifications"} onClick={() => setToast(null)} className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">{toast.title}</p><p className="text-[12.5px] text-muted">{toast.body}</p>
            </Link>
            <button onClick={() => setToast(null)} className="self-start text-muted hover:text-white" aria-label="Закрыть">✕</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
