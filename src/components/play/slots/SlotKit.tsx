"use client";
import { sfx, type Sfx } from "@/lib/sound";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { points, SNOW } from "@/lib/format";
import { parsePoints, unitsToInput, type GameConfig } from "../kit";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type LineWin = { line: number; sym: string; count: number; mult: number };
const LINE_COLORS = ["#fbbf24", "#35f08c", "#22d3ee", "#f472b6", "#a78bfa", "#fb923c", "#4ade80", "#38bdf8", "#e879f9", "#facc15"];

/**
 * Сетка барабанов. При смене spinKey каждый барабан «прокручивается» и останавливается с задержкой слева направо.
 * slowFrom — «интрига»: с этого барабана и правее вращение затягивается и барабаны подсвечиваются в ожидании бонуса.
 */
export function Reels<T>({ grid, rows, spinKey, turbo, filler, render, highlight, lines, linePatterns, overlay, onStopped, cellClass = "", slowFrom = null, sound }: {
  grid: T[][]; rows: number; spinKey: number; turbo: boolean; filler: () => T; render: (cell: T, i: { reel: number; row: number; dim: boolean; hot: boolean }) => React.ReactNode;
  highlight?: Set<string> | null; lines?: LineWin[]; linePatterns?: number[][]; overlay?: React.ReactNode; onStopped?: () => void; cellClass?: string; slowFrom?: number | null;
  /** Свои звуки слота: раскрутка и остановка барабана. */
  sound?: { spin?: Sfx; stop?: Sfx };
}) {
  const reels = grid.length;
  const F = turbo ? 6 : 14;
  const extra = (reel: number) => (spinKey && slowFrom !== null && reel >= slowFrom ? reel - slowFrom + 1 : 0);
  const fill = (reel: number) => F + extra(reel) * 26;
  const strips = useMemo(() => grid.map((col, reel) => (spinKey ? [...col, ...Array.from({ length: fill(reel) }, filler)] : col)), [spinKey, grid, F, slowFrom]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = useRef(0);
  const [stopped, setStopped] = useState<number[]>([]);
  useEffect(() => { done.current = 0; setStopped([]); if (spinKey) sfx(sound?.spin ?? "spin"); }, [spinKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${reels}, minmax(0, 1fr))` }}>
      {strips.map((strip, reel) => {
        const waiting = extra(reel) > 0 && !stopped.includes(reel);
        return (
          <div key={reel} className={`relative overflow-hidden rounded-xl bg-black/35 ring-1 transition-shadow ${waiting ? "ring-2 ring-gold" : "ring-white/10"}`} style={{ aspectRatio: `1 / ${rows}` }}>
            {waiting && <div aria-hidden className="reel-wait pointer-events-none absolute inset-0 z-10 rounded-xl shadow-[inset_0_0_34px_rgb(251_191_36/0.85)]" />}
            <motion.div key={`${spinKey}-${reel}`} className="absolute inset-x-0 top-0"
              style={{ height: `${(strip.length / rows) * 100}%` }}
              initial={spinKey ? { y: `${-(fill(reel) / strip.length) * 100}%` } : false}
              animate={{ y: "0%" }}
              transition={{ duration: (turbo ? 0.35 : 0.75) + reel * (turbo ? 0.08 : 0.18) + extra(reel) * (turbo ? 0.8 : 1.4), ease: extra(reel) ? [0.3, 0.55, 0.3, 1] : [0.25, 0.9, 0.35, 1.04] }}
              onAnimationComplete={() => { if (!spinKey) return; sfx(extra(reel) ? "gem" : sound?.stop ?? "reel", { i: reel, pitch: 1 + reel * 0.08 }); setStopped((s) => [...s, reel]); if (++done.current === reels) onStopped?.(); }}>
              {strip.map((cell, row) => {
                const id = `${reel}:${row}`; const hot = !!highlight?.has(id) && row < rows; const dim = !!highlight && highlight.size > 0 && !hot;
                return (
                  <div key={row} className={`relative p-[5%] ${cellClass}`} style={{ height: `${100 / strip.length}%` }}>
                    {/* Свечение — неподвижный градиент, пульсация — CSS transform (без filter, чтобы не грузить телефон) */}
                    {hot && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg bg-[radial-gradient(circle,rgb(251_191_36/0.55),transparent_70%)]" />}
                    <div className={`relative size-full ${hot ? "cell-hot" : ""}`} style={{ opacity: dim ? 0.35 : 1 }}>
                      {render(cell, { reel, row, dim, hot })}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>
        );
      })}
      {lines && linePatterns && lines.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${reels * 100} ${rows * 100}`} preserveAspectRatio="none" aria-hidden>
          {lines.map((w, k) => {
            const pts = linePatterns[w.line]!.map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`).join(" ");
            return (
              <g key={w.line}>
                {/* Тёмная подложка вместо тяжёлого фильтра тени */}
                <motion.polyline initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: k * 0.08 }} points={pts}
                  fill="none" stroke="#000" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} vectorEffect="non-scaling-stroke" />
                <motion.polyline initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: k * 0.08 }} points={pts}
                  fill="none" stroke={LINE_COLORS[w.line % LINE_COLORS.length]} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </svg>
      )}
      {overlay}
    </div>
  );
}

/** Клетки, участвующие в выигрышных линиях. */
export function winCells(lines: LineWin[], patterns: number[][]) {
  const s = new Set<string>();
  for (const w of lines) for (let r = 0; r < w.count; r++) s.add(`${r}:${patterns[w.line]![r]}`);
  return s;
}

const STEPS = [10n, 20n, 50n, 100n, 200n, 500n, 1000n, 2000n, 5000n, 10000n, 20000n, 50000n, 100000n, 200000n, 500000n, 1000000n];

/** Панель слота: ставка, большая кнопка вращения, автоигра, турбо, покупка бонуса, таблица выплат. */
export function SlotControls({ cfg, bet, setBet, busy, onSpin, onBuy, buyPrice, auto, setAuto, turbo, setTurbo, onInfo, accent, lastWin }: {
  cfg: GameConfig; bet: string; setBet: (v: string) => void; busy: boolean; onSpin: () => void; onBuy?: () => void; buyPrice?: number;
  auto: number; setAuto: (n: number) => void; turbo: boolean; setTurbo: (v: boolean) => void; onInfo: () => void; accent: [string, string]; lastWin: string | null;
}) {
  const { balance, user } = useAuth();
  const units = parsePoints(bet) ?? 0n;
  const min = BigInt(cfg.minBet), max = BigInt(cfg.maxBet);
  const steps = STEPS.filter((s) => s >= min && s <= max);
  const step = (dir: 1 | -1) => {
    const i = steps.findIndex((s) => s >= units);
    const next = dir > 0 ? steps[Math.min((i < 0 ? steps.length - 1 : units === steps[i] ? i + 1 : i), steps.length - 1)] : steps[Math.max((i < 0 ? steps.length : i) - 1, 0)];
    if (next) setBet(unitsToInput(next));
  };
  const enough = !user || units <= BigInt(balance);
  const buyCost = units * BigInt(buyPrice ?? 0);
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-center justify-between gap-1 rounded-2xl bg-black/55 p-1.5 sm:gap-2 sm:p-2 ring-1 ring-white/10">
        <div className="min-w-0 px-1 sm:px-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Ставка</p>
          <p className="truncate font-mono text-[14px] font-bold tabular sm:text-[18px]">{points(units)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <RoundBtn label="Уменьшить ставку" onClick={() => step(-1)} disabled={busy || auto > 0}>−</RoundBtn>
          <motion.button type="button" onClick={auto > 0 ? () => setAuto(0) : onSpin} disabled={(busy && auto === 0) || !cfg.enabled || (!enough && auto === 0)} whileTap={{ scale: 0.92 }}
            aria-label={auto > 0 ? "Остановить автоигру" : "Крутить"}
            className="relative grid size-[58px] shrink-0 place-items-center rounded-full sm:size-[74px] text-white shadow-[0_10px_30px_-8px_rgb(0_0_0/0.8)] disabled:opacity-50"
            style={{ background: `radial-gradient(circle at 35% 30%, ${accent[1]}, ${accent[0]})`, boxShadow: `0 0 0 4px rgb(255 255 255 / 0.12), 0 12px 34px -10px ${accent[0]}` }}>
            {auto > 0 ? <span className="grid leading-none"><span className="font-mono text-[18px] font-bold">∞</span><span className="text-[9px] font-bold uppercase">стоп</span></span> : (
              <motion.svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" animate={busy ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { repeat: Infinity, duration: 0.6, ease: "linear" } : {}}>
                <path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4h-4" />
              </motion.svg>
            )}
          </motion.button>
          <RoundBtn label="Увеличить ставку" onClick={() => step(1)} disabled={busy || auto > 0}>+</RoundBtn>
        </div>
        <div className="min-w-0 px-1 text-right sm:px-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Выигрыш</p>
          <p className={`truncate font-mono text-[14px] font-bold tabular sm:text-[18px] ${lastWin && BigInt(lastWin) > 0n ? "text-gold" : "text-white/50"}`}>{lastWin ? points(lastWin) : "—"}</p>
        </div>
      </div>
      <div className={`grid gap-2 ${onBuy ? "grid-cols-[1fr_1fr_44px_1fr_1fr]" : "grid-cols-[1fr_1fr_44px_1fr]"}`}>
        {/* Автоигра бесконечная: крутит, пока не нажмёшь «Стоп» (или пока хватает рублей) */}
        <Pill onClick={() => setAuto(auto > 0 ? 0 : Infinity)} active={auto > 0} disabled={busy && auto === 0}>{auto > 0 ? "■ Стоп" : "∞ Авто"}</Pill>
        <Pill onClick={() => setTurbo(!turbo)} active={turbo}>⚡ Турбо</Pill>
        <SoundToggle className="!size-11 !rounded-xl !bg-black/40" testId="sound-pill" />
        <Pill onClick={onInfo}>Выплаты</Pill>
        {onBuy && <Pill onClick={onBuy} disabled={busy || auto > 0 || !cfg.enabled || (!!user && buyCost > BigInt(balance))} gold><span className="block leading-tight">Бонус</span><span className="block truncate text-[10.5px] font-semibold leading-tight">{points(buyCost)}</span></Pill>}
      </div>
      {!enough && user && <p className="text-center text-[12.5px] text-danger">Недостаточно средств — уменьши ставку или забери бонус в кабинете.</p>}
    </div>
  );
}
function RoundBtn({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className="grid size-9 place-items-center rounded-full bg-white/10 text-[20px] sm:size-10 sm:text-[22px] font-bold hover:bg-white/20 disabled:opacity-40">{children}</button>;
}
function Pill({ children, onClick, active, disabled, gold }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; gold?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`h-11 w-full min-w-0 truncate rounded-xl px-1 text-[12px] font-bold sm:px-2 sm:text-[12.5px] transition-colors disabled:opacity-40 ${gold ? "bg-[linear-gradient(180deg,#fde68a,#f59e0b)] text-[#3a2300]" : active ? "bg-white text-ink" : "bg-black/40 text-white ring-1 ring-white/10 hover:bg-black/60"}`}>{children}</button>
  );
}

/** Уровни крупного выигрыша (в разах от ставки): надпись «растёт», пока докручивается сумма. */
const TIERS = [
  { at: 0, title: "ОТЛИЧНО!", c: ["#8fdcff", "#ffffff"] },
  { at: 10, title: "БОЛЬШОЙ ВЫИГРЫШ", c: ["#ffd166", "#fff6d0"] },
  { at: 25, title: "ОГРОМНЫЙ ВЫИГРЫШ", c: ["#ff6b8b", "#ffd166"] },
  { at: 50, title: "МЕГА ВЫИГРЫШ", c: ["#8fdcff", "#d8a8ff"] },
  { at: 100, title: "ЭПИЧЕСКИЙ ВЫИГРЫШ", c: ["#3ee08f", "#ffd166"] },
] as const;
const RAIN = ["🪙", "⭐", "❄️", "🎁", "✨", "🪙", "💰"];
const fmt = (v: number) => v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tierOf = (m: number) => TIERS.reduce((best, t, i) => (m >= t.at ? i : best), 0);

/**
 * Крупный выигрыш на весь экран: вращающиеся лучи, дождь из монет, снежинок и подарков,
 * счётчик суммы, а надпись повышается по уровням (×10 → ×25 → ×50 → ×100) с тряской и вспышкой.
 * Производительность: счётчик пишет цифры прямо в DOM (без перерисовки React каждый кадр),
 * все эффекты — CSS-анимации transform/opacity на видеокарте; на телефонах частиц меньше.
 * Клик: первый — сразу досчитать, второй — закрыть. short — короткая версия (выигрыш внутри бонуса).
 */
export function WinOverlay({ show, mult, amount, onDone, label, short = false }: { show: boolean; mult: number; amount: string; onDone: () => void; label?: string; short?: boolean }) {
  const [tierIdx, setTierIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const skip = useRef(false);
  const done = useRef(onDone); done.current = onDone;
  const amountEl = useRef<HTMLSpanElement>(null);
  const multEl = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);
  const [lite, setLite] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Слабее эффекты на телефонах и при «уменьшить движение»
    setLite(window.matchMedia("(max-width: 640px), (pointer: coarse), (prefers-reduced-motion: reduce)").matches);
  }, []);
  const dur = short ? 1500 : mult >= 100 ? 6500 : mult >= 50 ? 5200 : mult >= 25 ? 4200 : mult >= 10 ? 3200 : 1800;
  const target = Number(amount) / 100;

  useEffect(() => {
    if (!show) { setTierIdx(0); setFinished(false); skip.current = false; return; }
    document.documentElement.classList.add("bigwin-open");   // ставим на паузу фоновый снег под оверлеем
    const t0 = performance.now(); let raf = 0; let to: ReturnType<typeof setTimeout> | undefined; let lastTier = 0; let lastDraw = 0; let lastTick = 0;
    sfx(short ? "win" : "bigwin");
    const tick = (t: number) => {
      const p = skip.current ? 1 : Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 2);
      // Цифры обновляем ~30 раз в секунду напрямую в DOM — без перерисовки всего оверлея
      if (t - lastDraw > 33 || p === 1) {
        lastDraw = t;
        if (amountEl.current) amountEl.current.textContent = fmt(target * e);
        if (multEl.current) multEl.current.textContent = (mult * e).toFixed(2);
      }
      const ti = tierOf(mult * e);
      if (p < 1 && t - lastTick > 90) { lastTick = t; sfx("count", { pitch: 1 + e * 0.6 }); }   // «счётчик» набегающей суммы
      if (ti !== lastTier) {
        lastTier = ti; setTierIdx(ti); sfx(ti >= 3 ? "megawin" : "bigwin");
        try { navigator.vibrate?.(ti >= 3 ? [60, 40, 90] : 50); } catch {}
      }
      if (p < 1) raf = requestAnimationFrame(tick);
      else { setFinished(true); sfx("coins"); to = setTimeout(() => done.current(), short ? 1100 : 2600); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); if (to) clearTimeout(to); document.documentElement.classList.remove("bigwin-open"); };
  }, [show, target, mult, dur, short]);

  const tier = TIERS[tierIdx]!;
  const [c1, c2] = tier.c;
  const rain = useMemo(() => Array.from({ length: lite ? (short ? 8 : 14) : short ? 16 : 32 }, (_, i) => ({
    ch: RAIN[i % RAIN.length]!, left: Math.random() * 96, delay: -Math.random() * 3, dur: 2.4 + Math.random() * 2.2, size: 18 + Math.random() * 20, rot: Math.round((Math.random() - 0.5) * 540),
  })), [show, short, lite]); // eslint-disable-line react-hooks/exhaustive-deps
  const burst = lite ? 10 : 18;
  const click = () => { if (!finished) skip.current = true; else done.current(); };
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div key="bigwin" data-testid="big-win" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }} onClick={click}
          className="bigwin fixed inset-0 z-[70] grid cursor-pointer select-none place-items-center overflow-hidden"
          style={{ background: `radial-gradient(circle at 50% 45%, ${c1}38, transparent 60%), rgb(4 7 20 / 0.94)`, contain: "strict" }}>
          {/* Вращающиеся лучи: один слой на видеокарте, затухание к краям — отдельный неподвижный слой */}
          <div aria-hidden className="bw-rays" style={{ background: `repeating-conic-gradient(from 0deg, ${c1}55 0deg 7deg, transparent 7deg 18deg)` }} />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 50% 45%, transparent 0, transparent 18%, #070b1f 62%)" }} />
          {/* Дождь из монет, звёзд, снежинок и подарков — чистый CSS */}
          {rain.map((r, i) => (
            <span key={i} aria-hidden className="bw-drop" style={{ left: `${r.left}%`, fontSize: r.size, animationDuration: `${r.dur}s`, animationDelay: `${r.delay}s`, ["--rot" as string]: `${r.rot}deg` }}>{r.ch}</span>
          ))}
          {/* Ударная волна, вспышка и искры при каждом новом уровне (перезапуск через key) */}
          <div key={`fx${tierIdx}`} aria-hidden className="pointer-events-none absolute inset-0">
            <div className="bw-wave" style={{ borderColor: c1 }} />
            {tierIdx > 0 && <div className="bw-flash" style={{ background: c2 }} />}
            {Array.from({ length: burst }, (_, i) => {
              const a = (i / burst) * Math.PI * 2; const r = 200 + (i % 3) * 60;
              return <span key={i} className="bw-spark" style={{ background: i % 2 ? c1 : c2, ["--x" as string]: `${Math.round(Math.cos(a) * r)}px`, ["--y" as string]: `${Math.round(Math.sin(a) * r * 0.85)}px` }} />;
            })}
          </div>
          {/* Надпись, сумма и множитель */}
          <div key={`sh${tierIdx}`} className={`relative z-10 grid place-items-center px-4 text-center ${tierIdx ? "bw-shake" : ""}`}>
            <p key={`t${tierIdx}`} className="bw-pop font-display text-[clamp(30px,8vw,84px)] font-bold leading-[1.05] tracking-wide"
              style={{ backgroundImage: `linear-gradient(180deg, ${c2}, ${c1})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              {tierIdx === 0 && label && !short ? "ИТОГ БОНУСА" : tier.title}
            </p>
            <p className="mt-2 font-mono text-[clamp(38px,11vw,104px)] font-bold leading-none tabular text-gold" style={{ textShadow: `0 0 18px ${c1}` }}>
              <span ref={amountEl}>0,00</span> {SNOW}
            </p>
            <p className="mt-2 rounded-full bg-black/40 px-4 py-1 font-mono text-[clamp(16px,3.6vw,24px)] font-bold text-white ring-1 ring-white/20">×<span ref={multEl}>0.00</span> ставки</p>
            {label && <p className="mt-3 text-[clamp(14px,3vw,18px)] font-semibold text-white/85">{label}</p>}
            <p className="mt-6 text-[12px] text-white/45">{finished ? "нажми, чтобы продолжить" : "нажми, чтобы досчитать"}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Сколько обычных спинов сделано с последнего выпавшего бонуса (хранится на сервере). */
export function useDrySpins(slug: string, loggedIn: boolean) {
  const [dry, setDry] = useState<number | null>(null);
  const [prev, setPrev] = useState<number | null>(null);
  useEffect(() => {
    if (!loggedIn) { setDry(null); return; }
    fetch(`/api/games/${slug}/dry`).then((r) => r.json()).then((x: { spins: number | null }) => setDry(x.spins)).catch(() => {});
  }, [slug, loggedIn]);
  /** Вызывается после обычного спина: bonus — выпал ли бонус. */
  const count = (bonus: boolean) => setDry((d) => { const n = (d ?? 0) + 1; if (bonus) { setPrev(n); return 0; } return n; });
  return { dry, prev, count };
}

export function DryCounter({ dry, prev, avg }: { dry: number | null; prev: number | null; avg: number }) {
  if (dry === null) return null;
  return (
    <div data-testid="dry-counter" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-black/60 px-3 py-2 text-[13px] ring-1 ring-white/10">
      <span className="text-white/75">🎁 Спинов без бонуса: <motion.b key={dry} initial={{ scale: 1.35 }} animate={{ scale: 1 }} className="inline-block font-mono text-[15px] text-gold">{dry}</motion.b></span>
      <span className="text-[12px] text-white/50">{prev !== null ? `прошлый бонус — на ${prev}-м спине · ` : ""}в среднем раз в ~{avg}</span>
    </div>
  );
}

/** Модальное окно с таблицей выплат и правилами. */
export function InfoModal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()} initial={{ y: 20 }} animate={{ y: 0 }} className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-panel p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-[20px] font-bold">{title}</h2><button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-white" aria-label="Закрыть">✕</button></div>
            <div className="grid gap-4 text-[14px] text-soft">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Общий хук слота: ставка, турбо, автоигра (останавливается на бонусе или при нехватке рублей). */
export function useSlotState(cfg: GameConfig) {
  const [bet, setBet] = useState(unitsToInput(BigInt(cfg.minBet) > 100n ? BigInt(cfg.minBet) : 100n));
  const [turbo, setTurbo] = useState(false);
  const [auto, setAuto] = useState(0);
  return { bet, setBet, turbo, setTurbo, auto, setAuto };
}

/** Надпись BONUS поверх бонус-символа — сразу понятно, что 3 таких запускают бесплатные вращения. */
export function BonusLabel() {
  return (
    <span className="pointer-events-none absolute inset-x-0 bottom-[6%] mx-auto w-fit rounded-md bg-[linear-gradient(180deg,#fde68a,#f59e0b)] px-1.5 py-px font-display text-[clamp(8px,2.2vw,13px)] font-bold tracking-wider text-[#3a2300] shadow-[0_0_12px_rgb(251_191_36/0.8)]">BONUS</span>
  );
}

/** Выигрыш = ставка × множитель (в единицах рублей). */
export const winUnits = (units: bigint, mult: number) => (units * BigInt(Math.round(mult * 10000))) / 10000n;

export type BonusState = { left: number; done: number; total: string; add: string | null; tick: number };

/**
 * Счётчик бонуса: общая сумма выигрыша за все бесплатные вращения.
 * После каждого вращения сумма плавно докручивается, а сверху всплывает «+выигрыш спина».
 */
export function BonusTotal({ state, color = "#ffd166", title = "🎁 Бонус", sub, label = "Выигрыш в бонусе" }: { state: BonusState | null; color?: string; title?: string; sub?: string; label?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const target = state ? Number(state.total) / 100 : 0;
  useEffect(() => {
    if (!state) { from.current = 0; return; }
    const a = from.current, b = target; const t0 = performance.now(); let raf = 0; let last = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 700); const v = a + (b - a) * (1 - Math.pow(1 - k, 3)); from.current = v;
      if (el.current && (t - last > 33 || k === 1)) { last = t; el.current.textContent = v.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, !!state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AnimatePresence>
      {state && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} data-testid="bonus-total"
          className="relative flex items-center justify-between gap-3 rounded-2xl bg-black/75 px-4 py-2.5 ring-2" style={{ boxShadow: `0 0 30px -8px ${color}`, ["--tw-ring-color" as string]: color }}>
          <div className="text-[12px] font-semibold uppercase leading-tight tracking-wider text-white/70">
            <span className="block text-[13px] text-white">{title}</span>
            {sub ?? `Спин ${state.done} · осталось ${state.left}`}
          </div>
          <div className="relative text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{label}</p>
            <motion.p key={state.tick} animate={state.add ? { scale: [1.18, 1] } : {}} transition={{ duration: 0.35 }}
              className="font-mono text-[clamp(22px,5vw,30px)] font-bold leading-none tabular" style={{ color, textShadow: `0 0 10px ${color}` }}>
              <span ref={el}>{from.current.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> {SNOW}
            </motion.p>
            <AnimatePresence>
              {state.add && (
                <motion.span key={state.tick} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: -4 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.4 }}
                  className="absolute -top-5 right-0 rounded-md bg-accent/90 px-1.5 font-mono text-[12px] font-bold text-ink">+{points(state.add)}</motion.span>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
