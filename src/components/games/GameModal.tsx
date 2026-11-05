"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { api, ApiError } from "@/lib/api";
import { points } from "@/lib/format";
import { CATEGORY_NAMES, GAMES, rtpLabel, type GameSlug } from "@/lib/games";

type GameRow = { slug: GameSlug; title: string; tagline: string; enabled: boolean; minBet: string; maxBet: string; houseEdgeBp: number };
type Ctx = { open: (slug: GameSlug) => void; favs: GameSlug[]; toggleFav: (slug: GameSlug) => void };
const GameModalCtx = createContext<Ctx>({ open: () => {}, favs: [], toggleFav: () => {} });
export const useGameModal = () => useContext(GameModalCtx);

const FAV_KEY = "vd_favs";
function readFavs(): GameSlug[] {
  try { const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => x in GAMES) : []; } catch { return []; }
}

/** Карточка игры перед входом: обложка, RTP, избранное, «Демо» (без регистрации) и «Играть». */
export function GameModalProvider({ children }: { children: React.ReactNode }) {
  const [slug, setSlug] = useState<GameSlug | null>(null);
  const [rows, setRows] = useState<Record<string, GameRow>>({});
  const [favs, setFavs] = useState<GameSlug[]>([]);
  const { user } = useAuth();
  // Избранное: у вошедшего игрока хранится на сервере (общее для всех устройств), у гостя без входа — в браузере.
  // После входа избранное из браузера один раз переносится в аккаунт.
  useEffect(() => {
    if (!user) { setFavs(readFavs()); return; }
    const local = readFavs();
    const req = local.length ? api<{ favorites: string[] }>("/api/favorites", { body: { merge: local } }) : api<{ favorites: string[] }>("/api/favorites");
    req.then((r) => { setFavs(r.favorites.filter((x): x is GameSlug => x in GAMES)); try { localStorage.removeItem(FAV_KEY); } catch {} }).catch(() => setFavs(local));
  }, [user?.publicId]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleFav = useCallback((s: GameSlug) => {
    const on = !favs.includes(s);
    const next = on ? [s, ...favs] : favs.filter((x) => x !== s);
    setFavs(next);
    if (user) api<{ favorites: string[] }>("/api/favorites", { body: { slug: s, on } }).then((r) => setFavs(r.favorites.filter((x): x is GameSlug => x in GAMES))).catch(() => setFavs(favs));
    else try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch {}
  }, [favs, user]);
  const open = useCallback((s: GameSlug) => {
    setSlug(s);
    if (!Object.keys(rows).length) api<{ games: GameRow[] }>("/api/games").then((r) => setRows(Object.fromEntries(r.games.map((g) => [g.slug, g])))).catch(() => {});
  }, [rows]);
  return (
    <GameModalCtx.Provider value={{ open, favs, toggleFav }}>
      {children}
      <AnimatePresence>{slug && <GameSheet key={slug} slug={slug} row={rows[slug]} fav={favs.includes(slug)} onFav={() => toggleFav(slug)} onClose={() => setSlug(null)} />}</AnimatePresence>
    </GameModalCtx.Provider>
  );
}

function GameSheet({ slug, row, fav, onFav, onClose }: { slug: GameSlug; row?: GameRow; fav: boolean; onFav: () => void; onClose: () => void }) {
  const g = GAMES[slug]; const { user, refresh } = useAuth(); const router = useRouter();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const enabled = row?.enabled ?? true;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc); document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onClose]);
  const go = () => { onClose(); router.push(`/games/${slug}`); };
  async function demo() {
    setBusy(true); setErr("");
    try { await api("/api/auth/guest", { method: "POST", body: {} }); await refresh(); go(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Не удалось запустить демо"); }
    finally { setBusy(false); }
  }
  return (
    <motion.div className="fixed inset-0 z-[60] grid items-end bg-black/70 backdrop-blur-sm sm:place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-modal aria-label={g.name} onClick={(e) => e.stopPropagation()} data-testid="game-sheet"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="relative w-full overflow-hidden rounded-t-[28px] border border-line bg-panel p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-[460px] sm:rounded-[28px] sm:p-6"
        style={{ boxShadow: `0 -10px 60px -20px ${g.theme[0]}` }}>
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full opacity-40 blur-3xl" style={{ background: g.theme[0] }} />
        <button onClick={onClose} className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-black/30 text-soft hover:text-white" aria-label="Закрыть">✕</button>
        <div className="relative flex gap-4">
          <div className="snow-cap relative aspect-[3/4] w-[38%] shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10" style={{ boxShadow: `0 16px 40px -16px ${g.theme[0]}` }}>
            <Image src={g.cover} alt="" fill sizes="200px" className={`object-cover ${enabled ? "" : "grayscale"}`} />
            {g.badge && <span className="absolute left-2 top-2 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: `linear-gradient(135deg, ${g.theme[0]}, ${g.theme[1]})` }}>{g.badge}</span>}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="pr-8 font-display text-[clamp(17px,4.6vw,28px)] font-bold leading-tight">{row?.title ?? g.name}</h2>
            <p className="mt-1 text-[13px] text-muted">Verdant Originals · {CATEGORY_NAMES[g.category]}</p>
            <p className="mt-2 line-clamp-3 text-[13.5px] leading-snug text-soft">{row?.tagline ?? g.blurb}</p>
            <div className="mt-auto flex items-center gap-3 pt-3">
              <button type="button" onClick={onFav} aria-pressed={fav} aria-label={fav ? "Убрать из избранного" : "В избранное"} data-testid="fav"
                className={`grid size-11 place-items-center rounded-full ring-1 transition-colors ${fav ? "bg-brand/20 text-brand ring-brand/50" : "bg-raised text-muted ring-line hover:text-white"}`}>
                <motion.svg key={String(fav)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} width="22" height="22" viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M12 21s-7.5-4.6-9.5-9.2C1 8.2 3.3 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.7 0 6 3.7 4.5 7.3C19.5 16.4 12 21 12 21z" /></motion.svg>
              </button>
              <div className="leading-tight">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">RTP</p>
                <p className="font-mono text-[16px] font-bold">{rtpLabel(slug, row?.houseEdgeBp ?? 100)}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-ink/70 p-3 text-[13px] ring-1 ring-line">
          <div><p className="text-muted">Ставка</p><p className="font-mono text-soft">{row ? `${points(row.minBet)} – ${points(row.maxBet)}` : "—"}</p></div>
          <div><p className="text-muted">Честность</p><p className="text-accent">🛡️ проверяемый результат</p></div>
        </div>
        {!user && <p className="relative mt-3 text-[12.5px] text-muted">«Демо» — сразу играть без регистрации на демо-кредитах (аккаунт гостя хранится 3 дня). «Играть» — зарегистрироваться и сохранить баланс.</p>}
        {err && <p className="relative mt-2 text-[13px] text-danger">{err}</p>}
        <div className={`relative mt-4 grid gap-2 ${user ? "grid-cols-1" : "grid-cols-[1fr_1.4fr]"}`}>
          {!user && (
            <button type="button" onClick={demo} disabled={busy || !enabled} data-testid="sheet-demo"
              className="h-14 rounded-2xl bg-raised font-display text-[17px] font-bold text-white ring-1 ring-line transition-colors hover:bg-raised/70 disabled:opacity-50">{busy ? "…" : "Демо"}</button>
          )}
          <button type="button" disabled={!enabled || busy} data-testid="sheet-play"
            onClick={() => (user ? go() : (onClose(), router.push(`/register?next=/games/${slug}`)))}
            className="btn-shine relative h-14 overflow-hidden rounded-2xl bg-[linear-gradient(180deg,#ff5f6f,#d4183a)] font-display text-[17px] font-bold text-white shadow-[0_12px_30px_-10px_#e8263f] disabled:opacity-50">
            {enabled ? "Играть" : "Игра выключена"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
