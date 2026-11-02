"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { GameIcon } from "./GameIcon";
import type { GameSlug } from "@/lib/games";

// Каждой игре — свой узор фона, нарисованный CSS-градиентами (без картинок)
const ART: Record<GameSlug, string> = {
  crash: "radial-gradient(120% 90% at 100% 0%, rgb(0 196 122 / .35), transparent 55%), linear-gradient(160deg, #1b2a24, #141719)",
  mines: "radial-gradient(90% 80% at 0% 100%, rgb(0 196 122 / .28), transparent 60%), repeating-linear-gradient(45deg, #1a1f22 0 14px, #171b1e 14px 28px)",
  dice: "radial-gradient(100% 90% at 80% 100%, rgb(110 123 255 / .25), transparent 55%), linear-gradient(200deg, #1c1f2a, #141719)",
  plinko: "radial-gradient(circle at 50% 0%, rgb(0 196 122 / .3), transparent 55%), radial-gradient(#2a3136 1.5px, transparent 1.6px) 0 0/18px 18px, #15191b",
  limbo: "radial-gradient(110% 80% at 50% 110%, rgb(245 212 74 / .22), transparent 55%), linear-gradient(180deg, #1d1c16, #141719)",
  roulette: "conic-gradient(from 0deg at 85% 15%, rgb(255 90 95 / .22), transparent 25%, rgb(0 196 122 / .22) 50%, transparent 75%), #151819",
};

export function GameCard({ slug, title, tagline, enabled = true, index = 0 }: { slug: GameSlug; title: string; tagline: string; enabled?: boolean; index?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04, duration: 0.3 }}>
      <Link href={`/games/${slug}`} aria-disabled={!enabled}
        className={`group relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-2xl border border-line p-4 transition-all duration-200 hover:-translate-y-1 hover:border-accent/60 hover:shadow-glow ${enabled ? "" : "pointer-events-none opacity-50"}`}
        style={{ background: ART[slug] }}>
        <span className="grid size-11 place-items-center rounded-xl bg-ink/60 text-accent ring-1 ring-white/5 backdrop-blur transition-transform group-hover:scale-110"><GameIcon slug={slug} size={24} /></span>
        <div>
          <p className="font-display text-[19px] font-bold">{title}</p>
          <p className="mt-1 text-[13px] leading-snug text-soft">{tagline}</p>
          {!enabled && <p className="mt-2 text-[12px] font-semibold text-warn">На обслуживании</p>}
        </div>
      </Link>
    </motion.div>
  );
}
