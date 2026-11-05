"use client";
import Link from "next/link";
import { useRef } from "react";
import type { GameSlug } from "@/lib/games";
import { GameCard } from "./GameCard";

/** Горизонтальная полка игр со стрелками (на телефоне листается пальцем). */
export function GameRow({ title, emoji, href, games }: { title: string; emoji: string; href?: string; games: { slug: GameSlug; title: string; enabled: boolean }[] }) {
  const box = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => box.current?.scrollBy({ left: d * box.current.clientWidth * 0.85, behavior: "smooth" });
  if (!games.length) return null;
  const arrow = "grid size-10 place-items-center rounded-xl bg-raised text-soft ring-1 ring-line transition-colors hover:text-white";
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 rounded-xl bg-panel px-3 py-1.5 font-display text-[18px] font-bold ring-1 ring-line sm:text-[20px]"><span aria-hidden>{emoji}</span>{title}</h2>
        <div className="flex items-center gap-1.5">
          {href && <Link href={href} className="mr-1 rounded-xl px-2 py-1.5 text-[13px] font-semibold text-soft hover:text-white">Все</Link>}
          <button type="button" onClick={() => scroll(-1)} className={`${arrow} hidden sm:grid`} aria-label="Назад"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m15 6-6 6 6 6" /></svg></button>
          <button type="button" onClick={() => scroll(1)} className={`${arrow} hidden sm:grid`} aria-label="Вперёд"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m9 6 6 6-6 6" /></svg></button>
        </div>
      </div>
      <div ref={box} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2 pt-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {games.map((g, i) => <div key={g.slug} className="w-[38%] shrink-0 snap-start sm:w-[23%] lg:w-[15.5%]"><GameCard {...g} index={i} /></div>)}
      </div>
    </section>
  );
}
