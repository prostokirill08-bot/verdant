"use client";
import { useId } from "react";

/**
 * Векторные символы слотов в стиле сайта VERDANT: тёмная плитка, неоновый контур, мягкое свечение.
 * Векторы чёткие на любом экране (в т.ч. телефонах с высокой плотностью) и почти ничего не весят.
 * Свечение — полупрозрачная обводка (без CSS/SVG-фильтров: на телефонах фильтры тормозят).
 */
export type Glyph =
  | "gem" | "crown" | "star" | "bolt" | "heart" | "clover" | "seven" | "bell" | "coin" | "orb" | "key" | "shield"
  | "rocket" | "flame" | "cherry" | "lemon" | "plum" | "melon" | "berry" | "compass" | "ring" | "burst" | "question"
  | "chest" | "planet" | "diamond" | "wild" | "v";

const STAR = (cx: number, cy: number, r1: number, r2: number, n = 5) =>
  Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? r2 : r1; const a = (Math.PI * i) / n - Math.PI / 2; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");

/** Основная форма знака (заливается градиентом) и детали (тонкие светлые линии). */
function shape(g: Glyph): { body: React.ReactNode; detail?: React.ReactNode } {
  switch (g) {
    case "gem": return { body: <path d="M30 22H70L86 40L50 84L14 40Z" />, detail: <path d="M14 40H86M30 22L40 40L50 22L60 40L70 22M40 40L50 84L60 40" /> };
    case "diamond": return { body: <path d="M50 10L82 50L50 90L18 50Z" />, detail: <path d="M18 50H82M50 10L38 50L50 90L62 50Z" /> };
    case "crown": return { body: <path d="M14 70L20 30L36 50L50 22L64 50L80 30L86 70ZM18 74H82V84H18Z" />, detail: <><circle cx="50" cy="22" r="4" /><circle cx="20" cy="30" r="3.5" /><circle cx="80" cy="30" r="3.5" /><path d="M30 62H70" /></> };
    case "star": return { body: <polygon points={STAR(50, 52, 40, 17)} />, detail: <path d="M50 12V52L88 40M50 52L74 84M50 52L26 84M50 52L12 40" /> };
    case "burst": return { body: <polygon points={STAR(50, 50, 42, 22, 8)} />, detail: <circle cx="50" cy="50" r="12" /> };
    case "bolt": return { body: <path d="M58 8L20 56H46L38 92L80 40H54L64 8Z" />, detail: <path d="M54 22L38 50" /> };
    case "heart": return { body: <path d="M50 86C18 64 10 44 18 30C26 16 44 18 50 32C56 18 74 16 82 30C90 44 82 64 50 86Z" />, detail: <path d="M28 34C30 28 36 26 40 28" /> };
    case "clover": return { body: <><circle cx="37" cy="37" r="15" /><circle cx="63" cy="37" r="15" /><circle cx="37" cy="61" r="15" /><circle cx="63" cy="61" r="15" /></>, detail: <path d="M50 50C56 66 62 76 70 88M50 26V74M26 49H74" /> };
    case "seven": return { body: <path d="M22 18H80V31L48 88H31L61 33H22Z" />, detail: <path d="M30 24H72" /> };
    case "bell": return { body: <path d="M50 12C30 12 26 34 26 52C26 62 20 68 15 72H85C80 68 74 62 74 52C74 34 70 12 50 12ZM42 78A8 8 0 0 0 58 78Z" />, detail: <path d="M36 40C38 30 42 26 48 24M15 72H85" /> };
    case "coin": return { body: <circle cx="50" cy="50" r="36" />, detail: <><circle cx="50" cy="50" r="27" /><path d="M38 37L50 64L62 37" /></> };
    case "v": return { body: <path d="M14 18H34L50 62L66 18H86L60 86H40Z" />, detail: <path d="M24 24L50 78L76 24" /> };
    case "orb": return { body: <circle cx="50" cy="48" r="30" />, detail: <><ellipse cx="50" cy="48" rx="42" ry="11" transform="rotate(-18 50 48)" /><path d="M36 34C40 28 46 26 52 26" /></> };
    case "planet": return { body: <circle cx="50" cy="50" r="24" />, detail: <><ellipse cx="50" cy="50" rx="44" ry="12" transform="rotate(-20 50 50)" /><path d="M40 40C43 36 47 34 51 34" /></> };
    case "key": return { body: <path d="M34 26A18 18 0 1 1 34 62A18 18 0 1 1 34 26ZM50 38H88V50H80V60H70V50H50Z" />, detail: <circle cx="34" cy="44" r="7" /> };
    case "shield": return { body: <path d="M50 10L84 22V48C84 70 68 84 50 92C32 84 16 70 16 48V22Z" />, detail: <path d="M36 34L50 66L64 34" /> };
    case "rocket": return { body: <path d="M82 18C62 18 42 30 32 50L50 68C70 58 82 38 82 18ZM32 50L18 52L28 40ZM50 68L48 82L60 72ZM30 60C24 66 20 76 18 82C24 80 34 76 40 70Z" />, detail: <circle cx="62" cy="38" r="7" /> };
    case "flame": return { body: <path d="M50 8C64 28 80 40 76 62C74 78 62 90 50 90C38 90 26 78 24 62C22 46 36 38 38 22C44 32 47 38 50 42C53 30 53 20 50 8Z" />, detail: <path d="M50 88C42 88 38 80 40 72C42 64 48 62 50 54C54 62 60 66 60 74C60 82 56 88 50 88Z" /> };
    case "cherry": return { body: <><circle cx="34" cy="66" r="16" /><circle cx="66" cy="70" r="16" /></>, detail: <path d="M34 50C38 34 48 22 58 16M66 54C64 38 60 26 58 16M58 16C66 12 76 14 82 22C74 24 66 22 58 16" /> };
    case "lemon": return { body: <path d="M14 54C14 34 30 22 50 22C70 22 86 34 86 54C86 70 70 80 50 80C30 80 14 70 14 54Z" transform="rotate(-18 50 52)" />, detail: <path d="M30 46C36 38 44 34 52 34" /> };
    case "plum": return { body: <path d="M50 26C70 26 82 42 82 58C82 76 66 88 50 88C34 88 18 76 18 58C18 42 30 26 50 26Z" />, detail: <path d="M50 30V60M50 26C52 18 58 12 66 10C64 18 58 24 50 26" /> };
    case "melon": return { body: <path d="M12 38H88A38 38 0 0 1 12 38Z" />, detail: <><path d="M20 42H80" /><circle cx="36" cy="54" r="2.5" /><circle cx="50" cy="60" r="2.5" /><circle cx="64" cy="54" r="2.5" /></> };
    case "berry": return { body: <path d="M50 90C30 76 18 58 20 42C22 30 34 26 50 30C66 26 78 30 80 42C82 58 70 76 50 90Z" />, detail: <><path d="M34 26L42 18L50 26L58 18L66 26" /><circle cx="40" cy="46" r="2.2" /><circle cx="58" cy="48" r="2.2" /><circle cx="48" cy="62" r="2.2" /><circle cx="62" cy="66" r="2.2" /></> };
    case "compass": return { body: <circle cx="50" cy="50" r="36" />, detail: <><path d="M50 18L58 50L50 82L42 50Z" /><circle cx="50" cy="50" r="4" /></> };
    case "ring": return { body: <path d="M50 30A26 26 0 1 1 50 82A26 26 0 1 1 50 30ZM50 40A16 16 0 1 0 50 72A16 16 0 1 0 50 40Z" fillRule="evenodd" />, detail: <path d="M40 12H60L66 22L50 34L34 22Z" /> };
    case "question": return { body: <circle cx="50" cy="50" r="36" />, detail: <path d="M38 38C38 28 46 24 52 24C60 24 66 30 66 37C66 46 52 48 52 58M52 70V72" /> };
    case "chest": return { body: <path d="M14 46H86V84H14ZM18 46C18 28 30 18 50 18C70 18 82 28 82 46Z" />, detail: <path d="M14 56H86M44 52H56V64H44ZM30 20V46M70 20V46" /> };
    case "wild": return { body: <path d="M10 24H28L36 62L46 24H54L64 62L72 24H90L74 80H58L50 48L42 80H26Z" /> };
  }
}

export type TileProps = {
  glyph?: Glyph; letter?: string;
  /** Основной цвет символа. */
  color: string;
  /** Оформление: обычный, ценный (ярче, с подсветкой), особый (бонус/wild — двойная рамка). */
  tier?: "low" | "high" | "special";
  label?: string; className?: string;
};

/** Плитка символа: заполняет родителя (родитель задаёт размер). */
export function NeonTile({ glyph, letter, color, tier = "low", label, className = "" }: TileProps) {
  const id = useId().replace(/:/g, "");
  const s = glyph ? shape(glyph) : null;
  const special = tier === "special"; const high = tier !== "low";
  return (
    <span className={`@container relative grid size-full place-items-center overflow-hidden rounded-[18%] ${className}`}
      style={{
        background: `radial-gradient(circle at 50% 38%, ${color}${high ? "38" : "22"}, #08120c 68%)`,
        boxShadow: `inset 0 0 0 ${special ? 2 : 1}px ${color}${special ? "cc" : "55"}, inset 0 1px 0 #ffffff14`,
      }}>
      <svg viewBox="0 0 100 100" className="size-[78%]" aria-hidden>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity={high ? 0.95 : 0.75} />
            <stop offset="0.45" stopColor={color} />
            <stop offset="1" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {s && (
          <>
            {/* свечение: широкая полупрозрачная обводка под знаком */}
            <g fill="none" stroke={color} strokeOpacity={high ? 0.35 : 0.22} strokeWidth="9" strokeLinejoin="round">{s.body}</g>
            <g fill={`url(#g${id})`} stroke="#eafff0" strokeOpacity="0.7" strokeWidth="1.6" strokeLinejoin="round">{s.body}</g>
            {s.detail && <g fill="none" stroke="#f4fff6" strokeOpacity="0.75" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{s.detail}</g>}
          </>
        )}
        {letter && (
          <>
            <text x="50" y="68" textAnchor="middle" fontSize={letter.length > 1 ? 48 : 58} fontWeight="800" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="8" style={{ fontFamily: "var(--font-display)" }}>{letter}</text>
            <text x="50" y="68" textAnchor="middle" fontSize={letter.length > 1 ? 48 : 58} fontWeight="800" fill={`url(#g${id})`} stroke="#eafff0" strokeOpacity="0.5" strokeWidth="1.2" style={{ fontFamily: "var(--font-display)" }}>{letter}</text>
          </>
        )}
      </svg>
      {label && <span className="pointer-events-none absolute inset-x-0 bottom-[6%] mx-auto w-fit max-w-[92%] rounded-[0.35em] px-[0.4em] py-px font-display text-[clamp(6px,15cqw,12px)] font-bold leading-[1.25] tracking-[0.04em] text-[#071007]" style={{ background: `linear-gradient(180deg, #e9ffb8, ${color})`, boxShadow: `0 0 12px ${color}aa` }}>{label}</span>}
    </span>
  );
}

/** Описание символа слота: какой знак и цвет. */
export type SymDef = { glyph?: Glyph; letter?: string; color: string; tier?: TileProps["tier"]; label?: string };
/** Символ по описанию из словаря слота. */
export function SlotSymbol({ defs, s, big }: { defs: Record<string, SymDef>; s: string; big?: boolean }) {
  const d = defs[s] ?? { glyph: "gem" as Glyph, color: "#8bea4e" };
  return <NeonTile {...d} label={big ? undefined : d.label} />;
}

/** Палитра символов: оттенки в гамме сайта. */
export const PAL = {
  lime: "#8bea4e", emerald: "#35e889", mint: "#6ff0c0", teal: "#2fd3c4", cyan: "#45c8f0", blue: "#5b8cff",
  violet: "#a78bfa", pink: "#ff6fb0", red: "#ff5c70", orange: "#ff9f43", gold: "#f5d76e", white: "#e9fff1",
} as const;
