"use client";
import { motion } from "framer-motion";

// Игральная карта в фирменном изумрудном стиле VERDANT.
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const FACE: Record<number, string> = { 11: "🧝", 12: "👸", 13: "♛" };
export type CardData = { rank: number; suit: number };

const SIZE = {
  sm: "w-[46px] text-[11px] rounded-lg",
  md: "w-[clamp(54px,15vw,84px)] text-[clamp(12px,3.4vw,17px)] rounded-xl",
  lg: "w-full max-w-[104px] text-[clamp(11px,3.2vw,18px)] rounded-xl",
} as const;

export function PlayingCard({ card, hidden, size = "md", delay = 0, from = { x: 60, y: -80 }, glow, dim }: {
  card?: CardData | null; hidden?: boolean; size?: keyof typeof SIZE; delay?: number; from?: { x: number; y: number }; glow?: string; dim?: boolean;
}) {
  const showFace = !!card && !hidden;
  const red = card && (card.suit === 1 || card.suit === 2);
  return (
    <motion.div initial={{ opacity: 0, x: from.x, y: from.y, rotate: 8 }} animate={{ opacity: dim ? 0.45 : 1, x: 0, y: 0, rotate: 0 }}
      transition={{ delay, type: "spring", stiffness: 260, damping: 24 }}
      className={`relative aspect-[5/7] shrink-0 [perspective:600px] ${SIZE[size]}`}>
      <motion.div className="absolute inset-0 [transform-style:preserve-3d]" initial={false} animate={{ rotateY: showFace ? 0 : 180 }} transition={{ duration: 0.45, delay: showFace ? delay + 0.15 : 0 }}>
        {/* Лицо */}
        <div className={`absolute inset-0 overflow-hidden rounded-[inherit] bg-[linear-gradient(160deg,#ffffff,#e8f5ec)] shadow-[0_10px_24px_-10px_rgb(0_0_0/0.8)] [backface-visibility:hidden] ${red ? "text-[#e11d48]" : "text-[#1e1b4b]"}`}
          style={glow ? { boxShadow: `0 0 0 2px ${glow}, 0 0 18px ${glow}` } : undefined}>
          {card && <>
            <span className="absolute left-[8%] top-[5%] text-center font-display font-bold leading-[0.95]">{RANKS[card.rank]}<br />{SUITS[card.suit]}</span>
            <span className="absolute bottom-[5%] right-[8%] rotate-180 text-center font-display font-bold leading-[0.95]">{RANKS[card.rank]}<br />{SUITS[card.suit]}</span>
            <span className="absolute inset-0 grid place-items-center text-[2.4em] leading-none">{FACE[card.rank] ?? SUITS[card.suit]}</span>
            <span aria-hidden className="absolute right-[6%] top-[5%] text-[0.75em] opacity-80">◈</span>
          </>}
        </div>
        {/* Рубашка */}
        <div className="absolute inset-0 grid place-items-center overflow-hidden rounded-[inherit] bg-[repeating-linear-gradient(45deg,#0e5835_0_8px,#062516_8px_16px)] shadow-[0_10px_24px_-10px_rgb(0_0_0/0.8)] ring-2 ring-inset ring-accent/60 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <span className="text-[1.8em]" aria-hidden>✦</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

export const cardName = (c: CardData) => `${RANKS[c.rank]}${SUITS[c.suit]}`;
