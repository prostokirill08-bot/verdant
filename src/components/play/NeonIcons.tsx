/** Общие векторные значки игр в неоновом стиле сайта: чёткие на любом экране, без картинок. */

export const NEON = {
  lime: "#8bea4e", emerald: "#35e889", mint: "#6ff0c0", cyan: "#45c8f0", violet: "#a78bfa", pink: "#ff6fb0",
  red: "#ff5c70", gold: "#f5d76e", ink: "#06100a", panel: "#0f1f15",
} as const;

/** Огранённый кристалл (выигрышная клетка). */
export function NeonGem({ color = NEON.lime, className = "size-[62%]" }: { color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={{ filter: `drop-shadow(0 0 6px ${color}aa)` }} aria-hidden>
      <path d="M7 3.5h10l4.5 5.5L12 21 2.5 9z" fill={color} stroke="#03140a" strokeWidth="1" strokeLinejoin="round" />
      <path d="M2.5 9h19M7 3.5 9.5 9 12 21l2.5-12L17 3.5M9.5 9 12 3.5 14.5 9" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth=".9" strokeLinejoin="round" />
      <path d="M7 3.5h10l-2.5 5.5h-5z" fill="#fff" fillOpacity=".35" />
    </svg>
  );
}

/** Неоновая мина: тёмный шар с красным ядром и шипами. */
export function NeonBomb({ dim, className = "size-[62%]" }: { dim?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} ${dim ? "opacity-55" : ""}`} style={{ filter: dim ? undefined : "drop-shadow(0 0 6px #ff5c70aa)" }} aria-hidden>
      <g stroke="#ff5c70" strokeWidth="2" strokeLinecap="round">
        {[0, 45, 90, 135].map((a) => <path key={a} d="M12 2.5v19" transform={`rotate(${a} 12 12)`} />)}
      </g>
      <circle cx="12" cy="12" r="6.6" fill="#14070b" stroke="#ff5c70" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.6" fill="#ff5c70" />
      <circle cx="9.6" cy="9.6" r="1.3" fill="#fff" fillOpacity=".55" />
    </svg>
  );
}

/** Монета VERDANT: изумрудная сторона с буквой V или серебряная с ромбом. */
export function NeonCoinFace({ side }: { side: "v" | "gem" }) {
  const emerald = side === "v";
  return (
    <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
      <defs>
        <radialGradient id={`cf-${side}`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor={emerald ? "#d8ffc0" : "#ffffff"} />
          <stop offset="0.45" stopColor={emerald ? "#6fdc54" : "#c9d6cf"} />
          <stop offset="1" stopColor={emerald ? "#15602c" : "#5d6b64"} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#cf-${side})`} />
      <circle cx="50" cy="50" r="40" fill="none" stroke={emerald ? "#0b3d1b" : "#3d4842"} strokeWidth="2" strokeDasharray="3 4" />
      <circle cx="50" cy="50" r="34" fill={emerald ? "#0c2a16" : "#1c2420"} stroke={emerald ? "#b9ff8a" : "#ffffff"} strokeOpacity=".7" strokeWidth="2" />
      {emerald
        ? <path d="M33 34h9l8 20 8-20h9L54 68h-8z" fill="#8bea4e" stroke="#eaffd9" strokeWidth="1.5" strokeLinejoin="round" />
        : <g><path d="M50 30 66 50 50 70 34 50z" fill="#d7e2dc" stroke="#fff" strokeWidth="1.5" /><path d="M34 50h32M50 30v40" stroke="#5d6b64" strokeWidth="1.2" /></g>}
    </svg>
  );
}
