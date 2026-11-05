"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Countdown } from "@/components/home/Countdown";
import { Avatar } from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { points } from "@/lib/format";

type Summary = {
  keys: { have: number; need: number };
  jackpot: { pool: string };
  tournament: { endsAt: string; prizes: string[]; top: { place: number; user: string; avatar: string; mult: number }[] };
};
const MEDAL = ["🥇", "🥈", "🥉"];

/** Две карточки на главной: джекпот сундука со снежными ключами и турнир недели. */
export function PromoStrip() {
  const [d, setD] = useState<Summary | null>(null);
  useEffect(() => { const load = () => api<Summary>("/api/promo").then(setD).catch(() => {}); void load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Link href="/bonuses#chest" className="group relative min-h-[190px] overflow-hidden rounded-[24px] border border-[#8fdcff]/25 bg-[#0b1638]" data-testid="promo-jackpot">
        <Image src="/img/ny/banners/chest.webp" alt="" fill sizes="(max-width: 768px) 100vw, 600px" className="object-cover object-[80%_center] transition-transform duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-transparent" />
        <div className="relative grid gap-1.5 p-5">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-[#8fdcff]">🔑 Джекпот сундука</p>
          <p className="font-display text-[clamp(28px,5vw,40px)] font-bold leading-none text-gold [text-shadow:0_0_24px_#ffb02e80]">{d ? points(d.jackpot.pool) : "…"}</p>
          <p className="max-w-[260px] text-[13.5px] text-white/80">Собери 4 снежных ключа за ставки и открой сундук Деда Мороза</p>
          <div className="mt-1 flex items-center gap-2">
            {d && <span className="flex gap-1">{Array.from({ length: d.keys.need }, (_, i) => <span key={i} className={`grid size-7 place-items-center rounded-lg text-[14px] ${i < d.keys.have ? "bg-gold/25 ring-1 ring-gold" : "bg-white/10 opacity-50 grayscale"}`}>🔑</span>)}</span>}
            <span className="rounded-xl bg-[linear-gradient(180deg,#ff5f6f,#d4183a)] px-3 py-1.5 text-[13px] font-bold text-white">Открыть</span>
          </div>
        </div>
      </Link>
      <Link href="/bonuses#tournament" className="group relative min-h-[190px] overflow-hidden rounded-[24px] border border-gold/25 bg-[#1a1030]" data-testid="promo-tournament">
        <Image src="/img/ny/banners/tournament.webp" alt="" fill sizes="(max-width: 768px) 100vw, 600px" className="object-cover object-[85%_center] transition-transform duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/80 to-transparent" />
        <div className="relative grid gap-2 p-5">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-gold">🏆 Турнир недели · {d ? points(d.tournament.prizes[0]!) : "…"}</p>
          <p className="font-display text-[22px] font-bold leading-tight">Ледяная гонка</p>
          {d && <Countdown to={d.tournament.endsAt} label="До конца турнира" compact />}
          <div className="grid gap-1">
            {d?.tournament.top.slice(0, 3).map((r) => (
              <span key={r.place} className="flex max-w-[280px] items-center gap-2 text-[13px]"><span>{MEDAL[r.place - 1]}</span><Avatar name={r.user} avatar={r.avatar} size={18} /><span className="min-w-0 flex-1 truncate">{r.user}</span><span className="font-mono font-semibold text-accent">{r.mult.toFixed(2)}×</span></span>
            ))}
            {d && !d.tournament.top.length && <span className="text-[13px] text-white/70">Таблица пуста — займи первое место!</span>}
          </div>
        </div>
      </Link>
    </div>
  );
}
