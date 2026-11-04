"use client";
import { sfx, spinTicks } from "@/lib/sound";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { CHEST_NAMES, CHESTS, meterView, WS, type ChestKind, type WsCell, type WsResult, type WsSpin, type WsTrigger } from "@/lib/fair/workshop";
import { points } from "@/lib/format";
import { ErrorLine, newKey, parsePoints, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "../kit";
import { BonusTotal, DryCounter, InfoModal, Reels, SlotControls, sleep, useDrySpins, useSlotState, WinOverlay, winCells, type BonusState, type LineWin } from "./SlotKit";

// ===== Оформление =====
const SYMS = ["cane", "mitten", "ginger", "cocoa", "globe", "nutcracker", "santa"];
const NAMES: Record<string, string> = { cane: "Талисман", mitten: "Перчатка", ginger: "Символ", cocoa: "Энергия", globe: "Сфера", nutcracker: "Страж", santa: "Пилот" };
/** Цвет и значок каждого сундука: монета того же цвета летит в него. */
const CHEST_STYLE: Record<ChestKind, { color: string; dark: string; icon: string; about: string }> = {
  gifts: { color: "#3ee08f", dark: "#0d6b3c", icon: "🎁", about: "Открой 3 подарка из 12 — в каждом множитель до ×100." },
  frost: { color: "#5bc8ff", dark: "#0b4f80", icon: "✦", about: "10 вращений: каждый символ фиксируется на месте до конца бонуса." },
  stars: { color: "#c38bff", dark: "#4b1f8a", icon: "⭐", about: "10 вращений: множитель растёт на +1 после каждого выигрыша." },
  bells: { color: "#ffd166", dark: "#8a5a00", icon: "🔔", about: "Колокольчики с номиналами и 3 перекрута; новый колокольчик возвращает перекруты к 3. Всё поле — ×200." },
  wheel: { color: "#ff5f6f", dark: "#8a0d24", icon: "🎡", about: "Колесо бонусов: от ×5 до ×250 ставки бонуса." },
};
const START: WsCell[][] = [
  [{ sym: "cane" }, { sym: "globe" }, { sym: "mitten" }, { sym: "ginger" }], [{ sym: "cocoa" }, { sym: "santa" }, { sym: "cane" }, { sym: "coin", chest: 0 }],
  [{ sym: "nutcracker" }, { sym: "ginger" }, { sym: "ginger" }, { sym: "mitten" }], [{ sym: "mitten" }, { sym: "coin", chest: 3 }, { sym: "cocoa" }, { sym: "cane" }],
  [{ sym: "globe" }, { sym: "cane" }, { sym: "cocoa" }, { sym: "nutcracker" }],
];
const randomCell = (): WsCell => (Math.random() < 0.04 ? { sym: "coin", chest: Math.floor(Math.random() * 5) } : { sym: SYMS[Math.floor(Math.random() * (SYMS.length - 1))]! });
const describe = (r: RoundView) => {
  const x = r.result as WsResult | null; if (!x || !x.base) return "—";
  if (x.triggers?.length) return `Сундук: ${x.triggers.map((t) => CHEST_NAMES[t.kind]).join(", ")} · ${x.totalMult}×`;
  return x.totalMult > 0 ? `Выигрыш ${x.totalMult}×${x.coins.length ? ` · монет ${x.coins.length}` : ""}` : x.coins.length ? `Монет: ${x.coins.length}` : "Без выигрыша";
};
const money = (u: number) => points(Math.round(u));

/** Значки бонусов (SVG): на сундуках и на монетах. */
function Glyph({ kind, className = "" }: { kind: ChestKind; className?: string }) {
  const common = { fill: "none", stroke: "#fff", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {kind === "gifts" && <g {...common}><rect x="4" y="10" width="16" height="10" rx="1.5" fill="#fff3" /><rect x="3" y="7" width="18" height="4" rx="1" fill="#fff4" /><path d="M12 7v13M12 7c-2-4-6-3-5-1s5 1 5 1c2-4 6-3 5-1s-5 1-5 1" /></g>}
      {kind === "frost" && <g {...common}>{[0, 60, 120].map((a) => <g key={a} transform={`rotate(${a} 12 12)`}><path d="M12 3v18M12 6.5l-2.5-2M12 6.5l2.5-2M12 17.5l-2.5 2M12 17.5l2.5 2" /></g>)}</g>}
      {kind === "stars" && <path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.5 1.1 6.3L12 17.3l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="#fff" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />}
      {kind === "bells" && <g {...common}><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" fill="#fff4" /><path d="M10 21a2 2 0 0 0 4 0M12 3v2" /></g>}
      {kind === "wheel" && <g {...common}><circle cx="12" cy="12" r="8.5" fill="#fff3" />{[0, 45, 90, 135].map((a) => <path key={a} d="M12 3.5v17" transform={`rotate(${a} 12 12)`} />)}<circle cx="12" cy="12" r="2" fill="#fff" /></g>}
    </svg>
  );
}

/** Монета: золотой гурт с насечкой и цветная эмаль со значком своего сундука. */
function Coin({ chest, size = "cell" }: { chest: number; size?: "cell" | "fly" }) {
  const k = CHESTS[chest]!; const st = CHEST_STYLE[k];
  return (
    <span className={`relative grid place-items-center rounded-full ${size === "cell" ? "size-[84%]" : "size-full"}`}
      style={{ background: "conic-gradient(from 0deg, #fff1b0, #d99a12, #ffe38a, #b97a08, #fff1b0, #d99a12, #ffe38a, #b97a08, #fff1b0)", boxShadow: `0 4px 10px rgb(0 0 0 / 0.5), 0 0 16px ${st.color}66` }}>
      {/* насечка по ободу */}
      <span className="absolute inset-[4%] rounded-full" style={{ background: "repeating-conic-gradient(#8a5a00 0 4deg, transparent 4deg 10deg)", WebkitMask: "radial-gradient(circle, transparent 62%, #000 63%)", mask: "radial-gradient(circle, transparent 62%, #000 63%)" }} />
      {/* эмаль цвета сундука */}
      <span className="absolute inset-[17%] grid place-items-center rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #ffffff66, transparent 45%), radial-gradient(circle, ${st.color}, ${st.dark})`, boxShadow: "inset 0 0 0 2px #fff3b0, inset 0 2px 6px rgb(0 0 0 / 0.45)" }}>
        <Glyph kind={k} className="size-[62%] drop-shadow-[0_1px_1px_rgb(0_0_0/0.6)]" />
      </span>
    </span>
  );
}

function Cell({ c, frozen }: { c: WsCell; frozen?: boolean }) {
  if (c.sym === "coin") return <span className="grid size-full place-items-center"><Coin chest={c.chest ?? 0} /></span>;
  return (
    <span className="relative block size-full">
      <Image src={`/img/verdant/slots/workshop/${c.sym}.webp`} alt={NAMES[c.sym] ?? c.sym} fill sizes="110px" className={`rounded-lg object-cover ${c.sym === "santa" ? "ring-2 ring-gold/70" : ""}`} draggable={false} />
      {frozen && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg bg-[linear-gradient(160deg,rgb(191_230_255/0.45),rgb(91_200_255/0.15))] ring-2 ring-[#bfe6ff]" />}
    </span>
  );
}

type ChestView = { kind: ChestKind; have: number; full?: boolean; open?: boolean; bump?: number };

/** Окно, в котором растёт горка монет (доли картинки сундука): от верха до передней стенки. */
const DOME = { aspect: "408 / 518", winTop: "9%", winH: "56.3%", winX: "8%" };
/** Шахматный порядок: спереди 3 сундука, сзади 2 между ними (центры в % ширины, размер в % ширины). */
const PLACE: Record<number, { cx: number; w: number; top: string; z: number }> = {
  0: { cx: 17, w: 31, top: "36.5%", z: 3 }, 2: { cx: 50, w: 31, top: "36.5%", z: 3 }, 4: { cx: 83, w: 31, top: "36.5%", z: 3 },
  1: { cx: 33.5, w: 27, top: "0%", z: 1 }, 3: { cx: 66.5, w: 27, top: "0%", z: 1 },
};

function Chest({ v, i, refEl }: { v: ChestView; i: number; refEl: (el: HTMLDivElement | null) => void }) {
  const st = CHEST_STYLE[v.kind]; const pl = PLACE[i]!;
  // Монет внутри тем больше, чем больше их нападало; до краёв сундук наполняет только «счастливая» монета
  const fill = v.full ? 1 : Math.min(0.8, 0.25 + (v.have / WS.visualMax) * 0.6);
  const shown = v.full || v.have > 0;
  return (
    <div ref={refEl} data-chest={i} className="absolute" style={{ left: `${pl.cx - pl.w / 2}%`, width: `${pl.w}%`, top: pl.top, zIndex: pl.z }}>
      <motion.div key={v.bump ?? 0} role="img" aria-label={`Сундук «${CHEST_NAMES[v.kind]}»`}
        animate={v.bump ? { scale: [1, 1.1, 1] } : {}} transition={{ duration: 0.3 }}
        className={`relative block w-full ${v.full ? "chest-full" : ""}`} style={{ aspectRatio: DOME.aspect }}>
        {v.full && <span aria-hidden className="pointer-events-none absolute -inset-[18%] rounded-full" style={{ background: `radial-gradient(circle, ${st.color}88, transparent 62%)` }} />}
        {/* Слои: сундук → горка монет (поднимается через transform) → передняя стенка → значок бонуса */}
        <Image src={`/img/verdant/slots/workshop/dome-back-${i}.webp`} alt="" fill sizes="170px" className="object-contain" priority />
        <div className="absolute overflow-hidden" style={{ top: DOME.winTop, height: DOME.winH, left: DOME.winX, right: DOME.winX }}>
          {/* Горка монет занимает нижние 62% окна; поднимается из-за передней стенки по мере наполнения */}
          <div className="absolute inset-x-0 bottom-0 h-[62%] transition-transform duration-500 ease-out" style={{ transform: `translateY(${shown ? (1 - fill) * 100 : 100}%)` }}>
            <Image src="/img/verdant/slots/workshop/pile.webp" alt="" fill sizes="150px" className="object-cover object-bottom" />
          </div>
        </div>
        <Image src={`/img/verdant/slots/workshop/dome-front-${i}.webp`} alt="" fill sizes="170px" className="object-contain" priority />
        <span className="absolute left-1/2 top-[68%] grid aspect-square w-[28%] -translate-x-1/2 place-items-center rounded-full"
          style={{ background: `radial-gradient(circle at 35% 30%, #ffffff55, transparent 45%), radial-gradient(circle, ${st.color}, ${st.dark})`, boxShadow: "0 0 0 2px #ffe08a, 0 0 0 4px #8a5a00, 0 3px 8px rgb(0 0 0 / 0.6)" }}>
          <Glyph kind={v.kind} className="size-[64%]" />
        </span>
      </motion.div>
    </div>
  );
}

/** Горы золотых монет под сундуками. back — гора за передним рядом, front — россыпь у ног передних сундуков. */
function GoldHeap({ layer }: { layer: "back" | "front" }) {
  const parts = layer === "back"
    ? [{ l: -4, w: 46, flip: false }, { l: 27, w: 46, flip: true }, { l: 58, w: 46, flip: false }]
    : [{ l: -20, w: 40, flip: true }, { l: 13.5, w: 40, flip: false }, { l: 46.5, w: 40, flip: true }, { l: 80, w: 40, flip: false }];   // вершины — между сундуками, значки не закрываются
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0" style={layer === "back" ? { top: "30%", height: "24%", zIndex: 2 } : { bottom: "-3%", height: "23%", zIndex: 4 }}>
      {parts.map((p, k) => (
        <div key={k} className="absolute bottom-0 h-full" style={{ left: `${p.l}%`, width: `${p.w}%`, transform: p.flip ? "scaleX(-1)" : undefined }}>
          <Image src="/img/verdant/slots/workshop/pile.webp" alt="" fill sizes="260px" className="object-cover object-bottom" />
        </div>
      ))}
    </div>
  );
}

/** Монеты сыплются: из открывшегося сундука вылетают вверх и в стороны, с золотой горы катятся вниз (только CSS transform). */
function CoinSpill({ chest }: { chest: number }) {
  const pl = PLACE[chest]!;
  const coins = useMemo(() => {
    const out: { x: string; y: string; dx: number; dy: number; up: number; r: number; d: number; s: number }[] = [];
    for (let k = 0; k < 16; k++) out.push({ x: `${pl.cx}%`, y: pl.top === "0%" ? "18%" : "55%", dx: (Math.random() - 0.5) * 260, dy: 180 + Math.random() * 160, up: 60 + Math.random() * 70, r: (Math.random() - 0.5) * 900, d: Math.random() * 0.5, s: 14 + Math.random() * 10 });
    for (let k = 0; k < 18; k++) out.push({ x: `${5 + Math.random() * 90}%`, y: `${40 + Math.random() * 40}%`, dx: (Math.random() - 0.5) * 70, dy: 160 + Math.random() * 220, up: 6 + Math.random() * 16, r: (Math.random() - 0.5) * 700, d: 0.15 + Math.random() * 1.1, s: 12 + Math.random() * 8 });
    return out;
  }, [chest, pl]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30 overflow-visible">
      {coins.map((c, k) => (
        <span key={k} className="coin-spill absolute rounded-full" style={{ left: c.x, top: c.y, width: c.s, height: c.s, animationDelay: `${c.d}s`, ["--dx" as string]: `${c.dx}px`, ["--dy" as string]: `${c.dy}px`, ["--up" as string]: `${-c.up}px`, ["--r" as string]: `${c.r}deg` }} />
      ))}
    </div>
  );
}

// ===== Бонусы =====
type GiftsState = { kind: "gifts"; boxes: number[]; opened: (number | null)[]; picks: number; reveal: boolean };
type BellsState = { kind: "bells"; cells: Record<string, number>; respins: number; fresh: string[]; full: boolean };
type WheelState = { kind: "wheel"; angle: number; spinning: boolean; segment: number | null };
type Feat = GiftsState | BellsState | WheelState | null;

function GiftsPanel({ s, onPick }: { s: GiftsState; onPick: (i: number) => void }) {
  return (
    <div className="grid h-full grid-cols-4 grid-rows-3 gap-1.5 p-2 sm:gap-2">
      {s.opened.map((v, i) => {
        const shown = v ?? (s.reveal ? s.boxes[i] : null);
        return (
          <button key={i} type="button" onClick={() => onPick(i)} disabled={v !== null || s.reveal}
            className={`relative grid place-items-center rounded-xl ring-1 transition-transform active:scale-95 ${v !== null ? "bg-[radial-gradient(circle,#3ee08f55,#0d6b3c)] ring-accent" : s.reveal ? "bg-black/40 opacity-60 ring-white/10" : "bg-[radial-gradient(circle,#1f6b45,#0b2d1f)] ring-white/15 hover:brightness-125"}`}>
            {shown === null ? <span className="gift-wobble text-[clamp(26px,7vw,46px)]" style={{ animationDelay: `${(i % 4) * 0.15}s` }}>🎁</span> : (
              <motion.span initial={{ scale: 0.3 }} animate={{ scale: 1 }} className={`font-display text-[clamp(18px,5vw,30px)] font-bold ${v !== null ? "text-gold" : "text-white/70"}`}>×{shown}</motion.span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function BellsPanel({ s }: { s: BellsState }) {
  return (
    <div className="grid h-full gap-1.5 p-2 sm:gap-2" style={{ gridTemplateColumns: `repeat(${WS.reels}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${WS.rows}, minmax(0, 1fr))` }}>
      {Array.from({ length: WS.rows }, (_, row) => Array.from({ length: WS.reels }, (_, reel) => {
        const key = `${reel}:${row}`; const v = s.cells[key];
        return (
          <div key={key} className={`grid place-items-center rounded-xl ${v !== undefined ? "bg-[radial-gradient(circle,#ffd16655,#4a3000)] ring-2 ring-gold" : "bg-black/45 ring-1 ring-white/10"}`} style={{ gridColumn: reel + 1, gridRow: row + 1 }}>
            {v !== undefined && (
              <motion.span key={s.fresh.includes(key) ? `n${key}` : key} initial={s.fresh.includes(key) ? { scale: 0, rotate: -30 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14 }} className="grid place-items-center leading-none">
                <span className="text-[clamp(18px,5vw,32px)]">🔔</span>
                <span className="font-mono text-[clamp(10px,2.6vw,14px)] font-bold text-gold">×{v}</span>
              </motion.span>
            )}
          </div>
        );
      }))}
    </div>
  );
}

function WheelPanel({ s }: { s: WheelState }) {
  const n = WS.wheel.length; const seg = 360 / n;
  const COLORS = ["#e8263f", "#1f9d55", "#ffd166", "#5b8cff", "#ff6b8b", "#3ee08f", "#c38bff", "#ffb02e", "#5bc8ff", "#ff4d6d", "#ffd166", "#ffffff"];
  return (
    <div className="grid h-full place-items-center p-2">
      <div className="relative aspect-square h-[92%] max-w-full">
        <svg viewBox="-110 -125 220 30" className="absolute inset-x-0 -top-[7%] z-10 w-full" aria-hidden><path d="M-9 -122 L9 -122 L0 -100Z" fill="#ffd166" stroke="#fff" strokeWidth="2" /></svg>
        <motion.svg viewBox="-100 -100 200 200" className="size-full" animate={{ rotate: s.angle }} transition={{ duration: s.spinning ? 4.2 : 0, ease: [0.12, 0.6, 0.12, 1] }}>
          <circle r="99" fill="#ffd166" /><circle r="94" fill="#0f1633" />
          {WS.wheel.map((m, i) => {
            const a0 = ((i - 0.5) * seg - 90) * (Math.PI / 180), a1 = ((i + 0.5) * seg - 90) * (Math.PI / 180); const R = 92;
            const am = i * seg - 90; const tx = 66 * Math.cos((am * Math.PI) / 180), ty = 66 * Math.sin((am * Math.PI) / 180);
            const light = COLORS[i] === "#ffd166" || COLORS[i] === "#ffffff" || COLORS[i] === "#3ee08f" || COLORS[i] === "#ffb02e";
            return (
              <g key={i}>
                <path d={`M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)}Z`} fill={COLORS[i]} stroke="#070b1f" strokeWidth="1" opacity={s.segment === null || s.segment === i || s.spinning ? 1 : 0.55} />
                <text x={tx} y={ty} fill={light ? "#2a1a00" : "#fff"} fontSize="11" fontWeight="800" textAnchor="middle" dominantBaseline="central" transform={`rotate(${am + 90} ${tx} ${ty})`}>×{m}</text>
              </g>
            );
          })}
          <circle r="18" fill="#0f1633" stroke="#ffd166" strokeWidth="3" />
          <text y="1" fontSize="18" textAnchor="middle" dominantBaseline="central">🎅</text>
        </motion.svg>
      </div>
    </div>
  );
}

function Intro({ t }: { t: WsTrigger }) {
  const st = CHEST_STYLE[t.kind];
  return (
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="grid max-w-[90%] place-items-center gap-2 p-4 text-center">
      <span className="grid size-[clamp(56px,14vw,84px)] place-items-center rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #ffffff55, transparent 45%), radial-gradient(circle, ${st.color}, ${st.dark})`, boxShadow: `0 0 0 3px #ffe08a, 0 0 30px ${st.color}` }}><Glyph kind={t.kind} className="size-[62%]" /></span>
      <p className="font-display text-[clamp(20px,5vw,34px)] font-bold" style={{ color: st.color }}>СУНДУК «{CHEST_NAMES[t.kind].toUpperCase()}»</p>
      <p className="text-[14px] text-white/85">{st.about}</p>
      <p className="rounded-full bg-black/50 px-3 py-1 font-mono text-[14px] text-gold ring-1 ring-gold/40">Открыт на {t.coins}-й монете · ставка {money(t.stake)}</p>
    </motion.div>
  );
}

type Fly = { id: number; x: number; y: number; dx: number; dy: number; chest: number };

export function WorkshopGame({ cfg }: { cfg: GameConfig }) {
  const { setBalance, balance, user } = useAuth();
  const { run, busy: reqBusy, error } = useGameRequest();
  const { bet, setBet, turbo, setTurbo, auto, setAuto } = useSlotState(cfg);
  const [grid, setGrid] = useState<WsCell[][]>(START);
  const [spinKey, setSpinKey] = useState(0);
  const [lines, setLines] = useState<LineWin[]>([]);
  const [hl, setHl] = useState<Set<string> | null>(null);
  const [sticky, setSticky] = useState<Set<string>>(new Set());
  const [starX, setStarX] = useState<number | null>(null);
  const [chests, setChests] = useState<ChestView[]>(() => meterView(CHESTS.map(() => ({ have: 0 }))));
  const [flying, setFlying] = useState<Fly[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [feat, setFeat] = useState<Feat>(null);
  const [fs, setFs] = useState<(BonusState & { title: string; sub: string; color: string }) | null>(null);
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [big, setBig] = useState<{ mult: number; amount: string; label?: string; short?: boolean } | null>(null);
  const { dry, prev, count } = useDrySpins("workshop", !!user);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [version, setVersion] = useState(0);
  const stop = useRef<() => void>(() => {});
  const bigDone = useRef<() => void>(() => {});
  const pickRes = useRef<((i: number) => void) | null>(null);
  // Бонус идёт по нажатиям игрока: кнопка действия и сундук, который ждёт открытия
  const [action, setAction] = useState<{ label: string; color: string } | null>(null);
  const [spill, setSpill] = useState<{ chest: number; key: number } | null>(null);
  const actionRes = useRef<(() => void) | null>(null);
  const actionEl = useRef<HTMLButtonElement>(null);
  // Кнопка бонуса всегда на виду: на телефоне она может оказаться под нижним меню — подкручиваем страницу
  useEffect(() => {
    const el = actionEl.current; if (!action || !el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 84 || r.top < 70) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [action]);
  // Панель бонуса (подарки, колокольчики, колесо) тоже должна быть на экране целиком
  const featKind = feat?.kind;
  useEffect(() => {
    const el = reelsBox.current; if (!featKind || !el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 84 || r.top < 70) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [featKind]);
  const waitTap = (label: string, color: string) => new Promise<void>((res) => { actionRes.current = () => { actionRes.current = null; setAction(null); res(); }; setAction({ label, color }); });
  const flyDone = useRef<Map<number, () => void>>(new Map());
  const chestEls = useRef<(HTMLDivElement | null)[]>([]);
  const reelsBox = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const turboRef = useRef(turbo); turboRef.current = turbo;
  const autoRef = useRef(auto); autoRef.current = auto;
  const t = (ms: number) => sleep(turboRef.current ? ms / 2 : ms);

  // Сундуки игрока с сервера
  useEffect(() => {
    if (!user) return;
    fetch("/api/games/workshop/meters").then((r) => r.json()).then((x: { chests?: ChestView[] }) => x.chests && setChests(x.chests)).catch(() => {});
  }, [user]);

  const spinTo = useCallback((g: WsCell[][]) => new Promise<void>((res) => { stop.current = res; setHl(null); setLines([]); setGrid(g); setSpinKey((k) => k + 1); }), []);
  const showBig = (mult: number, amount: string, label?: string, short = false) => new Promise<void>((res) => { bigDone.current = () => { setBig(null); res(); }; setBig({ mult, amount, label, short }); });

  function showWins(s: WsSpin) {
    const cells = winCells(s.wins, WS.lines);
    setLines(s.wins); setHl(cells.size ? cells : null);
    if (s.mult > 0 && s.mult < 10) sfx(s.mult >= 3 ? "bigwin" : "win");
  }

  /** Монеты слетают с барабанов в свои сундуки; сундук наполняется по мере прилёта. */
  async function flyCoins(r: WsResult) {
    const box = reelsBox.current; if (!box || !r.coins.length) return;
    const view = r.before.map((m) => ({ have: m.have, done: false }));
    const shown = chests.map((c) => ({ ...c }));
    let id = Date.now();
    const jobs = r.coins.map((c, k) => new Promise<void>((resolve) => {
      setTimeout(() => {
        const from = box.querySelector(`[data-ws="${c.reel}:${c.row}"]`)?.getBoundingClientRect();
        const to = chestEls.current[c.chest]?.getBoundingClientRect();
        if (!from || !to) { resolve(); return; }
        const size = 40; const fid = ++id;
        const x = from.left + from.width / 2 - size / 2, y = from.top + from.height / 2 - size / 2;
        const dx = to.left + to.width / 2 - size / 2 - x, dy = to.top + to.height * 0.35 - size / 2 - y;
        flyDone.current.set(fid, () => {
          setFlying((f) => f.filter((z) => z.id !== fid));
          // Прилёт: +1 монета; «счастливая» монета наполняет сундук до краёв
          const m = view[c.chest]!; const v = shown[c.chest]!;
          sfx(c.fills ? "chest" : "coin", { pitch: 0.9 + c.chest * 0.08 });   // монета падает в сундук; «счастливая» — открывает его
          if (!m.done) {
            m.have++;
            shown[c.chest] = { ...v, have: m.have, full: c.fills, bump: (v.bump ?? 0) + 1 };
            if (c.fills) m.done = true;   // монеты после наполнения уже копятся в новый сундук — покажем после бонуса
          } else shown[c.chest] = { ...v, bump: (v.bump ?? 0) + 1 };
          setChests(shown.map((z) => ({ ...z })));
          resolve();
        });
        setFlying((f) => [...f, { id: fid, x, y, dx, dy, chest: c.chest }]);
      }, k * (turboRef.current ? 90 : 160));
    }));
    await Promise.all(jobs);
    await t(250);
  }

  async function runSpins(spins: (WsSpin & { sticky?: string[]; x?: number })[], tr: WsTrigger, title: string) {
    let total = 0; let tick = 0; const st = CHEST_STYLE[tr.kind];
    for (let i = 0; i < spins.length; i++) {
      const s = spins[i]!;
      setFs({ left: spins.length - i - 1, done: i + 1, total: String(Math.round(total)), add: null, tick, title, sub: tr.kind === "stars" ? `Спин ${i + 1}/${spins.length} · множитель ×${s.x}` : `Спин ${i + 1}/${spins.length} · примёрзло ${s.sticky?.length ?? 0}`, color: st.color });
      if (tr.kind === "stars") setStarX(s.x ?? 1);
      await waitTap(`Крутить · ${i + 1} из ${spins.length}`, st.color);
      await spinTo(s.grid);
      if (s.sticky) setSticky(new Set(s.sticky));
      showWins(s);
      const add = Math.floor(tr.stake * s.mult);
      if (add > 0) { total += add; tick++; sfx("coin"); }
      setFs((f) => f && { ...f, total: String(Math.round(total)), add: add > 0 ? String(add) : null, tick });
      await t(add > 0 ? 700 : 200);
    }
  }

  async function playTrigger(tr: WsTrigger, r: WsResult) {
    const st = CHEST_STYLE[tr.kind];
    // Сундук открывается сам: на телефоне подкручиваем страницу к сундукам, с золотой горы сыплются монеты
    const top = stageRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 60 || top > window.innerHeight * 0.5) stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setSpill({ chest: tr.chest, key: Date.now() });
    sfx("chest"); sfx("coins", { delay: 350 });
    await sleep(turboRef.current ? 1300 : 2000);
    // Заставка бонуса уходит сама через пару секунд (можно пропустить нажатием)
    await new Promise<void>((res) => {
      const go = () => { clearTimeout(tm); setBanner(null); res(); };
      const tm = setTimeout(go, turboRef.current ? 1500 : 2400);
      sfx("bonus");
      setBanner(<div onClick={go} className="grid cursor-pointer place-items-center"><Intro t={tr} /></div>);
    });
    setSpill(null);
    const f = tr.feature;
    if (f.kind === "gifts") {
      const opened: (number | null)[] = Array(f.boxes.length).fill(null);
      setFeat({ kind: "gifts", boxes: f.boxes, opened, picks: f.picks, reveal: false });
      let total = 0;
      for (let k = 0; k < f.picks; k++) {
        setFs({ left: f.picks - k, done: k, total: String(total), add: null, tick: k, title: "🎁 Подарки", sub: `Открой ещё ${f.picks - k} из ${f.boxes.length}`, color: st.color });
        const i = await new Promise<number>((res) => { pickRes.current = res; });
        pickRes.current = null;
        if (opened[i] !== null) { k--; continue; }
        opened[i] = f.boxes[k]!; total += Math.floor(tr.stake * f.boxes[k]!);
        sfx("pop"); sfx(f.boxes[k]! >= 10 ? "bigwin" : "coin", { delay: 120 });
        setFeat({ kind: "gifts", boxes: f.boxes.map((v, j) => (opened[j] !== null ? opened[j]! : v)), opened: [...opened], picks: f.picks, reveal: false });
        setFs({ left: f.picks - k - 1, done: k + 1, total: String(total), add: String(Math.floor(tr.stake * f.boxes[k]!)), tick: k + 1, title: "🎁 Подарки", sub: `Открыто ${k + 1} из ${f.picks}`, color: st.color });
        await t(600);
      }
      // Показываем, что лежало в остальных подарках
      const rest = f.boxes.slice(f.picks); const display: number[] = []; let ri = 0;
      opened.forEach((v, j) => { display[j] = v !== null ? v : rest[ri++]!; });
      setFeat({ kind: "gifts", boxes: display, opened: [...opened], picks: f.picks, reveal: true });
      await t(1400);
    } else if (f.kind === "frost" || f.kind === "stars") {
      await runSpins(f.spins, tr, f.kind === "frost" ? "✦ Мороз" : "⭐ Звездопад");
      setSticky(new Set()); setStarX(null);
    } else if (f.kind === "bells") {
      let prevKeys: string[] = [];
      for (let k = 0; k < f.steps.length; k++) {
        const step = f.steps[k]!; const keys = Object.keys(step.cells);
        if (k > 0) await waitTap(`Перекрут · осталось ${f.steps[k - 1]!.respins}`, st.color);
        const fresh = keys.filter((x) => !prevKeys.includes(x)); prevKeys = keys;
        const sum = Object.values(step.cells).reduce((s, v) => s + v, 0);
        setFeat({ kind: "bells", cells: step.cells, respins: step.respins, fresh, full: false });
        if (k === 0) sfx("bells"); else if (fresh.length) fresh.forEach((_, j) => sfx("gem", { pitch: 1 + j * 0.12, delay: j * 90 }));
        setFs({ left: step.respins, done: k, total: String(Math.floor(tr.stake * sum)), add: fresh.length && k > 0 ? String(Math.floor(tr.stake * fresh.reduce((s, x) => s + step.cells[x]!, 0))) : null, tick: k, title: "🔔 Колокольчики", sub: `Перекрутов: ${step.respins} · колокольчиков ${keys.length}/${WS.reels * WS.rows}`, color: st.color });
        await t(k === 0 ? 700 : fresh.length ? 600 : 250);
      }
      if (f.full) { sfx("jackpot"); setBanner(<p className="font-display text-[28px] font-bold text-gold">ВСЁ ПОЛЕ! +×{WS.bellGrand}</p>); await sleep(1500); setBanner(null); }
    } else if (f.kind === "wheel") {
      setFeat({ kind: "wheel", angle: 0, spinning: false, segment: null });
      setFs({ left: 0, done: 0, total: "0", add: null, tick: 0, title: "🎡 Колесо", sub: "Крути колесо!", color: st.color });
      await waitTap("Крутить колесо", st.color);
      setFs((x) => x && { ...x, sub: "Колесо крутится…" });
      const seg = 360 / WS.wheel.length;
      setFeat({ kind: "wheel", angle: 360 * 6 - f.segment * seg - (Math.random() - 0.5) * seg * 0.6, spinning: true, segment: f.segment });
      spinTicks(6 * WS.wheel.length + f.segment, 4300);
      await sleep(4400);
      sfx("bigwin");
      setFeat({ kind: "wheel", angle: 360 * 6 - f.segment * seg, spinning: false, segment: f.segment });
      setFs({ left: 0, done: 1, total: String(tr.payout), add: String(tr.payout), tick: 1, title: "🎡 Колесо", sub: `Выпало ×${WS.wheel[f.segment]}`, color: st.color });
      await t(900);
    }
    // Итог сундука (с учётом потолка) и большой экран выигрыша
    setFs((x) => x && { ...x, total: String(tr.payout) });
    await t(400);
    await showBig(tr.payout / r.bet, String(tr.payout), `Сундук «${CHEST_NAMES[tr.kind]}»`);
    setFeat(null); setFs(null); setHl(null); setLines([]);
    // Сундук опустел — показываем его заново (уже с новым порогом)
    setChests((cs) => cs.map((c, i) => (i === tr.chest ? { kind: c.kind, have: 0 } : c)));
    setFs(null);
  }

  async function play(): Promise<boolean> {
    setPlaying(true); setLastWin(null); setHl(null); setLines([]);
    const r0 = await run<{ round: RoundView; balance: string }>("/api/games/workshop/bet", { amount: bet, params: {}, key: newKey() }, { deferBalance: true });
    if (!r0) { setPlaying(false); return false; }
    setBalance((BigInt(balance) - BigInt(r0.round.bet)).toString());
    const r = r0.round.result as unknown as WsResult;
    await spinTo(r.base.grid);
    showWins(r.base);
    if (r.baseWin > 0) setLastWin(String(r.baseWin));
    if (r.coins.length) await flyCoins(r);
    else await t(r.baseWin > 0 ? 700 : 150);
    count(r.triggers.length > 0);
    if (r.base.mult >= 10) await showBig(r.base.mult, String(r.baseWin));
    if (r.triggers.length) setAuto(0);   // бонус игрок проходит сам — автоигра останавливается
    for (const tr of r.triggers) await playTrigger(tr, r);
    setChests(meterView(r.after));
    setLastWin(r0.round.payout);
    setBalance(r0.balance); setVersion((v) => v + 1); setPlaying(false);
    return true;
  }

  // Автоигра бесконечная: крутит, пока не нажмёшь «Стоп» или пока хватает средств
  useEffect(() => {
    if (auto <= 0 || playing || reqBusy) return;
    if (user && (parsePoints(bet) ?? 0n) > BigInt(balance)) { setAuto(0); return; }
    const tm = setTimeout(async () => { const cont = await play(); setAuto((a) => (cont && a > 0 ? a - 1 : 0)); }, 250);
    return () => clearTimeout(tm);
  }, [auto, playing, reqBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = playing || reqBusy;
  const st = fs ? fs.color : "#ffb02e";
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <div className="relative overflow-hidden rounded-[28px] ring-1 ring-white/10" style={{ boxShadow: "0 30px 80px -40px #ffb02e" }}>
        <Image src="/img/verdant/bg/workshop.webp" alt="" fill priority sizes="100vw" className="object-cover object-[78%_center]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070b1f]/45 via-[#070b1f]/35 to-[#070b1f]/90" />
        <div className="relative mx-auto grid max-w-[720px] gap-3 p-3 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[clamp(20px,4.4vw,32px)] font-bold tracking-wide text-[#ffd98a] drop-shadow-[0_2px_12px_rgb(255_150_40/0.8)]">▣ EMERALD CASES</h2>
            {starX !== null && <span className="rounded-xl bg-black/60 px-3 py-1.5 font-display text-[20px] font-bold text-[#c38bff] ring-1 ring-[#c38bff]/60">×{starX}</span>}
          </div>
          {/* Пять сундуков: у каждого свой бонус */}
          <div ref={stageRef} className="relative z-20 mx-auto w-full max-w-[560px] scroll-mt-20" style={{ aspectRatio: "100 / 82" }}>
            {/* Золото: гора за передним рядом (на ней стоят задние сундуки) и россыпь у ног передних */}
            <GoldHeap layer="back" />
            {chests.map((c, i) => <Chest key={c.kind} v={c} i={i} refEl={(el) => { chestEls.current[i] = el; }} />)}
            <GoldHeap layer="front" />
            {spill && <CoinSpill key={spill.key} chest={spill.chest} />}
          </div>
          <BonusTotal state={fs} color={st} title={fs?.title} sub={fs?.sub} label="Выигрыш сундука" />
          <div ref={reelsBox} className="snow-cap relative rounded-2xl bg-[linear-gradient(180deg,#3a1d0e,#140a05)] p-2 shadow-[inset_0_0_0_2px_rgb(255_176_46/0.6),0_20px_50px_-20px_#000] sm:p-3">
            <Reels grid={grid} rows={4} spinKey={spinKey} turbo={turbo || !!fs} filler={randomCell} onStopped={() => stop.current()}
              render={(c, { reel, row }) => <span className="block size-full" data-ws={`${reel}:${row}`}><Cell c={c} frozen={c.sym === "santa" && sticky.has(`${reel}:${row}`)} /></span>}
              highlight={hl} lines={lines} linePatterns={WS.lines} />
            <AnimatePresence>{feat && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-2 z-10 rounded-xl bg-[#140a05]/95 sm:inset-3">
                {feat.kind === "gifts" && <GiftsPanel s={feat} onPick={(i) => pickRes.current?.(i)} />}
                {feat.kind === "bells" && <BellsPanel s={feat} />}
                {feat.kind === "wheel" && <WheelPanel s={feat} />}
              </motion.div>
            )}</AnimatePresence>
            <AnimatePresence>{banner && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/85 p-3">{banner}</motion.div>
            )}</AnimatePresence>
            <WinOverlay show={!!big} mult={big?.mult ?? 0} amount={big?.amount ?? "0"} label={big?.label} short={big?.short} onDone={() => bigDone.current()} />
          </div>
          <DryCounter dry={dry} prev={prev} avg={57} />
          {action ? (
            <motion.button ref={actionEl} type="button" data-testid="bonus-action" onClick={() => actionRes.current?.()} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: [1, 1.03, 1], opacity: 1 }} transition={{ scale: { duration: 1.2, repeat: Infinity } }}
              className="h-16 rounded-2xl font-display text-[clamp(16px,4vw,20px)] font-bold uppercase tracking-wide text-ink shadow-[0_12px_30px_-10px_#000]"
              style={{ background: `linear-gradient(180deg, #fff6, transparent), ${action.color}`, boxShadow: `0 0 0 3px #ffffff33, 0 0 30px -4px ${action.color}` }}>
              {action.label}
            </motion.button>
          ) : user ? (
            <SlotControls cfg={cfg} bet={bet} setBet={setBet} busy={busy} onSpin={() => void play()}
              auto={auto} setAuto={setAuto} turbo={turbo} setTurbo={setTurbo} onInfo={() => setInfo(true)} accent={["#b45309", "#ffb02e"]} lastWin={lastWin} />
          ) : <PlayButton onClick={() => {}}>Войти</PlayButton>}
          <ErrorLine text={error} />
        </div>
      </div>
      {/* Летящие монеты: отдельный слой поверх страницы, анимация только transform */}
      {mounted && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[65]">
          {flying.map((f) => (
            <motion.div key={f.id} className="absolute size-10" style={{ left: f.x, top: f.y }}
              initial={{ x: 0, y: 0, scale: 1.25 }} animate={{ x: f.dx, y: f.dy, scale: 0.6 }} transition={{ duration: turbo ? 0.4 : 0.6, ease: [0.4, 0, 0.6, 1] }}
              onAnimationComplete={() => { const cb = flyDone.current.get(f.id); flyDone.current.delete(f.id); cb?.(); }}>
              <Coin chest={f.chest} size="fly" />
            </motion.div>
          ))}
        </div>, document.body)}
      <RoundsPanel slug="workshop" version={version} describe={describe} />
      <InfoModal open={info} onClose={() => setInfo(false)} title="Emerald Cases — правила">
        <p>25 фиксированных линий, ставка делится на 25. Выплата — за 3–5 одинаковых символов слева направо (числа — во сколько раз больше ставки на линию). <b>Дед Мороз</b> — дикий символ на барабанах 2–4.</p>
        <div className="grid grid-cols-2 gap-2">
          {(["nutcracker", "globe", "cocoa", "ginger", "mitten", "cane"] as const).map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-xl bg-ink p-2">
              <span className="relative size-12 shrink-0"><Cell c={{ sym: s }} /></span>
              <span className="font-mono text-[12px]">{Object.entries(WS.pays[s]!).reverse().map(([n, v]) => <span key={n} className="block">{n}× — {v}</span>)}</span>
            </div>
          ))}
        </div>
        <p><b>Монеты</b> пяти цветов иногда падают на барабаны и улетают в сундук своего цвета. Каждая монета с шансом 10% наполняет сундук до краёв — тогда он открывает свой бонус. Поэтому сундуку может хватить 1 монеты, а может понадобиться 30 — каждый раз случайно. Шанс одинаковый у любой монеты: полный на вид сундук не «вот-вот откроется».</p>
        <div className="grid gap-2">
          {CHESTS.map((k) => (
            <div key={k} className="flex items-start gap-3 rounded-xl bg-ink p-3">
              <span className="grid size-10 shrink-0 place-items-center"><Coin chest={CHESTS.indexOf(k)} size="fly" /></span>
              <p><b style={{ color: CHEST_STYLE[k].color }}>{CHEST_NAMES[k]}</b> — {CHEST_STYLE[k].about}</p>
            </div>
          ))}
        </div>
        <p>Бонус проходишь сам: открываешь сундук, выбираешь подарки, запускаешь вращения, перекруты и колесо. Автоигра на бонусе останавливается. Призы бонуса определяются в момент спина — так любой раунд можно пересчитать на странице «Честность»; от порядка нажатий сумма не меняется.</p>
        <p>Выигрыш бонуса — множитель × текущая ставка (не больше ×{WS.maxFeature}). Расчётный RTP ≈ 95,5%.</p>
      </InfoModal>
    </div>
  );
}
