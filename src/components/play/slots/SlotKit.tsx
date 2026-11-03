"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { points } from "@/lib/format";
import { parsePoints, unitsToInput, type GameConfig } from "../kit";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type LineWin = { line: number; sym: string; count: number; mult: number };
const LINE_COLORS = ["#fbbf24", "#35f08c", "#22d3ee", "#f472b6", "#a78bfa", "#fb923c", "#4ade80", "#38bdf8", "#e879f9", "#facc15"];

/**
 * Сетка барабанов. При смене spinKey каждый барабан «прокручивается» и останавливается с задержкой слева направо.
 * slowFrom — «интрига»: с этого барабана и правее вращение затягивается и барабаны подсвечиваются в ожидании бонуса.
 */
export function Reels<T>({ grid, rows, spinKey, turbo, filler, render, highlight, lines, linePatterns, overlay, onStopped, cellClass = "", slowFrom = null }: {
  grid: T[][]; rows: number; spinKey: number; turbo: boolean; filler: () => T; render: (cell: T, i: { reel: number; row: number; dim: boolean; hot: boolean }) => React.ReactNode;
  highlight?: Set<string> | null; lines?: LineWin[]; linePatterns?: number[][]; overlay?: React.ReactNode; onStopped?: () => void; cellClass?: string; slowFrom?: number | null;
}) {
  const reels = grid.length;
  const F = turbo ? 6 : 14;
  const extra = (reel: number) => (spinKey && slowFrom !== null && reel >= slowFrom ? reel - slowFrom + 1 : 0);
  const fill = (reel: number) => F + extra(reel) * 26;
  const strips = useMemo(() => grid.map((col, reel) => (spinKey ? [...col, ...Array.from({ length: fill(reel) }, filler)] : col)), [spinKey, grid, F, slowFrom]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = useRef(0);
  const [stopped, setStopped] = useState<number[]>([]);
  useEffect(() => { done.current = 0; setStopped([]); }, [spinKey]);
  return (
    <div className="relative grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${reels}, minmax(0, 1fr))` }}>
      {strips.map((strip, reel) => {
        const waiting = extra(reel) > 0 && !stopped.includes(reel);
        return (
          <div key={reel} className={`relative overflow-hidden rounded-xl bg-black/35 ring-1 transition-shadow ${waiting ? "ring-2 ring-gold" : "ring-white/10"}`} style={{ aspectRatio: `1 / ${rows}` }}>
            {waiting && <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-10 rounded-xl" animate={{ boxShadow: ["inset 0 0 12px rgb(251 191 36 / 0.3)", "inset 0 0 34px rgb(251 191 36 / 0.85)", "inset 0 0 12px rgb(251 191 36 / 0.3)"] }} transition={{ duration: 0.6, repeat: Infinity }} />}
            <motion.div key={`${spinKey}-${reel}`} className="absolute inset-x-0 top-0"
              style={{ height: `${(strip.length / rows) * 100}%` }}
              initial={spinKey ? { y: `${-(fill(reel) / strip.length) * 100}%` } : false}
              animate={{ y: "0%" }}
              transition={{ duration: (turbo ? 0.35 : 0.75) + reel * (turbo ? 0.08 : 0.18) + extra(reel) * (turbo ? 0.8 : 1.4), ease: extra(reel) ? [0.3, 0.55, 0.3, 1] : [0.25, 0.9, 0.35, 1.04] }}
              onAnimationComplete={() => { if (!spinKey) return; setStopped((s) => [...s, reel]); if (++done.current === reels) onStopped?.(); }}>
              {strip.map((cell, row) => {
                const id = `${reel}:${row}`; const hot = !!highlight?.has(id) && row < rows; const dim = !!highlight && highlight.size > 0 && !hot;
                return (
                  <div key={row} className={`relative p-[5%] ${cellClass}`} style={{ height: `${100 / strip.length}%` }}>
                    <motion.div className="relative size-full" animate={hot ? { scale: [1, 1.12, 1] } : { scale: 1 }} transition={hot ? { duration: 0.7, repeat: Infinity } : {}}
                      style={{ opacity: dim ? 0.35 : 1, filter: hot ? "drop-shadow(0 0 10px rgb(251 191 36 / 0.9))" : undefined }}>
                      {render(cell, { reel, row, dim, hot })}
                    </motion.div>
                  </div>
                );
              })}
            </motion.div>
          </div>
        );
      })}
      {lines && linePatterns && lines.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${reels * 100} ${rows * 100}`} preserveAspectRatio="none" aria-hidden>
          {lines.map((w, k) => (
            <motion.polyline key={w.line} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: k * 0.08 }}
              points={linePatterns[w.line]!.map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`).join(" ")}
              fill="none" stroke={LINE_COLORS[w.line % LINE_COLORS.length]} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} vectorEffect="non-scaling-stroke"
              style={{ filter: "drop-shadow(0 0 4px rgb(0 0 0 / 0.6))" }} />
          ))}
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
  cfg: GameConfig; bet: string; setBet: (v: string) => void; busy: boolean; onSpin: () => void; onBuy: () => void; buyPrice: number;
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
  const buyCost = units * BigInt(buyPrice);
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-black/40 p-2 ring-1 ring-white/10 backdrop-blur">
        <div className="min-w-0 px-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Ставка</p>
          <p className="font-mono text-[18px] font-bold tabular">{points(units)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <RoundBtn label="Уменьшить ставку" onClick={() => step(-1)} disabled={busy || auto > 0}>−</RoundBtn>
          <motion.button type="button" onClick={auto > 0 ? () => setAuto(0) : onSpin} disabled={(busy && auto === 0) || !cfg.enabled || (!enough && auto === 0)} whileTap={{ scale: 0.92 }}
            aria-label={auto > 0 ? "Остановить автоигру" : "Крутить"}
            className="relative grid size-[74px] place-items-center rounded-full text-white shadow-[0_10px_30px_-8px_rgb(0_0_0/0.8)] disabled:opacity-50"
            style={{ background: `radial-gradient(circle at 35% 30%, ${accent[1]}, ${accent[0]})`, boxShadow: `0 0 0 4px rgb(255 255 255 / 0.12), 0 12px 34px -10px ${accent[0]}` }}>
            {auto > 0 ? <span className="grid leading-none"><span className="font-mono text-[18px] font-bold">∞</span><span className="text-[9px] font-bold uppercase">стоп</span></span> : (
              <motion.svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" animate={busy ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { repeat: Infinity, duration: 0.6, ease: "linear" } : {}}>
                <path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4h-4" />
              </motion.svg>
            )}
          </motion.button>
          <RoundBtn label="Увеличить ставку" onClick={() => step(1)} disabled={busy || auto > 0}>+</RoundBtn>
        </div>
        <div className="min-w-0 px-2 text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Выигрыш</p>
          <p className={`font-mono text-[18px] font-bold tabular ${lastWin && BigInt(lastWin) > 0n ? "text-gold" : "text-white/50"}`}>{lastWin ? points(lastWin) : "—"}</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {/* Автоигра бесконечная: крутит, пока не нажмёшь «Стоп» (или пока хватает баллов) */}
        <Pill onClick={() => setAuto(auto > 0 ? 0 : Infinity)} active={auto > 0} disabled={busy && auto === 0}>{auto > 0 ? "■ Стоп" : "∞ Авто"}</Pill>
        <Pill onClick={() => setTurbo(!turbo)} active={turbo}>⚡ Турбо</Pill>
        <Pill onClick={onInfo}>Выплаты</Pill>
        <Pill onClick={onBuy} disabled={busy || auto > 0 || !cfg.enabled || (!!user && buyCost > BigInt(balance))} gold>Бонус {points(buyCost)}</Pill>
      </div>
      {!enough && user && <p className="text-center text-[12.5px] text-danger">Недостаточно баллов — уменьши ставку или забери бонус в кабинете.</p>}
    </div>
  );
}
function RoundBtn({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className="grid size-10 place-items-center rounded-full bg-white/10 text-[22px] font-bold hover:bg-white/20 disabled:opacity-40">{children}</button>;
}
function Pill({ children, onClick, active, disabled, gold }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; gold?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`h-10 w-full truncate rounded-xl px-2 text-[12.5px] font-bold transition-colors disabled:opacity-40 ${gold ? "bg-[linear-gradient(180deg,#fde68a,#f59e0b)] text-[#3a2300]" : active ? "bg-white text-ink" : "bg-black/40 text-white ring-1 ring-white/10 hover:bg-black/60"}`}>{children}</button>
  );
}

/** Крупный выигрыш: всплывающая надпись со счётчиком. */
export function WinOverlay({ show, mult, amount, onDone, label }: { show: boolean; mult: number; amount: string; onDone: () => void; label?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!show) return;
    const target = Number(amount) / 100; const t0 = performance.now(); let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / 1400); setShown(target * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const to = setTimeout(onDone, 2600);
    return () => { cancelAnimationFrame(raf); clearTimeout(to); };
  }, [show, amount, onDone]);
  const title = label ?? (mult >= 50 ? "МЕГА ВЫИГРЫШ" : mult >= 20 ? "КРУПНЫЙ ВЫИГРЫШ" : "ОТЛИЧНО!");
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onDone} className="absolute inset-0 z-30 grid place-items-center rounded-2xl bg-black/60 backdrop-blur-[2px]">
          <motion.div initial={{ scale: 0.4, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 220, damping: 14 }} className="text-center">
            <p className="font-display text-[clamp(22px,5vw,40px)] font-bold text-gradient drop-shadow-[0_4px_20px_rgb(251_191_36/0.6)]">{title}</p>
            <p className="mt-1 font-mono text-[clamp(30px,7vw,60px)] font-bold text-gold tabular drop-shadow-[0_0_24px_rgb(251_191_36/0.7)]">{shown.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="font-mono text-white/80">{mult.toFixed(2)}× ставки</p>
          </motion.div>
          {Array.from({ length: 18 }, (_, i) => (
            <motion.span key={i} className="absolute size-2 rounded-full" style={{ background: LINE_COLORS[i % LINE_COLORS.length], left: "50%", top: "50%" }}
              initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(i * 0.35) * 260, y: Math.sin(i * 0.35) * 180 - 40, opacity: 0 }} transition={{ duration: 1.4, delay: 0.1 }} />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
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

/** Общий хук слота: ставка, турбо, автоигра (останавливается на бонусе или при нехватке баллов). */
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
