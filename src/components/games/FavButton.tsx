"use client";
import type { GameSlug } from "@/lib/games";
import { useGameModal } from "./GameModal";

/** Кнопка «В избранное» (сердце). Внутри ссылки-карточки не открывает игру. */
export function FavButton({ slug, className = "", size = 18 }: { slug: GameSlug; className?: string; size?: number }) {
  const { favs, toggleFav } = useGameModal(); const on = favs.includes(slug);
  return (
    <button type="button" aria-pressed={on} aria-label={on ? "Убрать из избранного" : "Добавить в избранное"} title={on ? "В избранном" : "В избранное"} data-testid={`fav-${slug}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(slug); }}
      className={`grid place-items-center rounded-full transition-colors ${on ? "bg-[#ff6fb0]/20 text-[#ff6fb0] ring-1 ring-[#ff6fb0]/50" : "bg-black/55 text-white/80 ring-1 ring-white/15 hover:text-white"} ${className}`}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
    </button>
  );
}
