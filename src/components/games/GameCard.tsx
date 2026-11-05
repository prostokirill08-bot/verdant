"use client";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { GAMES, type GameSlug } from "@/lib/games";
import { useGameModal } from "./GameModal";
import { FavButton } from "./FavButton";

/** Плитка игры: обложка, название, бейдж; при наведении — подъём и свечение в цвете темы игры. */
export function GameCard({ slug, title, enabled = true, index = 0, size = "md" }: { slug: GameSlug; title?: string; enabled?: boolean; index?: number; size?: "md" | "lg" }) {
  const g = GAMES[slug]; const { open } = useGameModal();
  return (
    <motion.div className="snow-cap" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.4) }}>
      <Link href={`/games/${slug}`} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); open(slug); }} className="game-card group relative block overflow-hidden rounded-2xl bg-panel ring-1 ring-white/10 transition-transform duration-200 hover:-translate-y-1.5 focus-visible:outline-2 focus-visible:outline-accent"
        style={{ boxShadow: `0 18px 40px -22px ${g.theme[0]}` }}>
        <div className={`relative ${size === "lg" ? "aspect-[4/5]" : "aspect-[3/4]"}`}>
          <Image src={g.cover} alt="" fill sizes="(max-width: 640px) 50vw, 240px" className={`object-cover transition-transform duration-500 group-hover:scale-110 ${enabled ? "" : "grayscale"}`} priority={index < 4} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <div className="card-sheen" aria-hidden />
          <div className="game-card-glow absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: `radial-gradient(70% 45% at 50% 0%, ${g.theme[0]}44, transparent 80%)`, boxShadow: `inset 0 0 0 1px ${g.theme[0]}aa` }} />
          {g.badge && enabled && <span className="absolute left-2 top-2 rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow" style={{ background: `linear-gradient(135deg, ${g.theme[0]}, ${g.theme[1]})` }}>{g.badge}</span>}
          {!enabled && <span className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-0.5 text-[11px] font-bold uppercase text-soft">Выключена</span>}
          <div className="absolute inset-x-0 bottom-0 z-[1] p-3">
            <p className="font-display text-[15px] font-bold leading-tight drop-shadow sm:text-[16px]">{title ?? g.name}</p>
            <p className="mt-0.5 line-clamp-1 text-[12px] text-white/70">{g.blurb}</p>
          </div>
          <span className="absolute left-1/2 top-[40%] grid size-11 -translate-x-1/2 -translate-y-1/2 scale-75 place-items-center rounded-full bg-accent text-accent-ink opacity-0 shadow-lg transition-all group-hover:scale-100 group-hover:opacity-100" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
          </span>
          <FavButton slug={slug} className="absolute right-2 top-2 size-8" size={16} />
        </div>
      </Link>
    </motion.div>
  );
}
