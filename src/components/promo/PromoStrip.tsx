"use client";
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

export function PromoStrip() {
  const [d, setD] = useState<Summary | null>(null);
  useEffect(() => { const load = () => api<Summary>("/api/promo").then(setD).catch(() => {}); void load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Link href="/bonuses#chest" className="glass-panel group relative min-h-[205px] overflow-hidden rounded-[24px] p-5 transition-all hover:border-emerald-300/30" data-testid="promo-jackpot">
        <div className="absolute -right-10 -top-16 size-64 rounded-full bg-emerald-400/[.13] blur-3xl transition-transform group-hover:scale-125"/>
        <div className="absolute right-8 top-8 size-24 rotate-45 rounded-[25px] border border-emerald-100/20 bg-gradient-to-br from-emerald-200/15 to-transparent shadow-[0_0_55px_#35d88a22]"/>
        <div className="relative grid gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[.19em] text-emerald-300">COMMUNITY POOL · ДЕМО</p>
          <p className="font-display text-[clamp(28px,5vw,38px)] font-bold leading-none text-[#d9fbe5]">{d ? points(d.jackpot.pool) : "…"}</p>
          <p className="max-w-[270px] text-[13px] leading-5 text-muted">Коллекционный сундук и прогресс сообщества в демо-режиме</p>
          <div className="mt-1 flex items-center gap-2">
            {d && <span className="flex gap-1">{Array.from({ length: d.keys.need }, (_, i) => <span key={i} className={`grid size-7 place-items-center rounded-lg text-[13px] ${i < d.keys.have ? "border border-emerald-300/40 bg-emerald-300/15" : "border border-white/5 bg-white/[.04] opacity-50 grayscale"}`}>◇</span>)}</span>}
            <span className="rounded-lg border border-emerald-200/20 bg-emerald-300/10 px-3 py-1.5 text-[12px] font-bold text-emerald-200">Подробнее ↗</span>
          </div>
        </div>
      </Link>
      <Link href="/bonuses#tournament" className="glass-panel group relative min-h-[205px] overflow-hidden rounded-[24px] p-5 transition-all hover:border-emerald-300/30" data-testid="promo-tournament">
        <div className="absolute -right-12 -bottom-24 size-72 rounded-full bg-teal-400/[.10] blur-3xl"/>
        <div className="relative grid gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[.19em] text-[#d9bd78]">WEEKLY LEADERBOARD</p>
          <p className="font-display text-[22px] font-bold leading-tight text-[#eafff0]">Рейтинг недели</p>
          {d && <Countdown to={d.tournament.endsAt} label="До конца недели" compact />}
          <div className="mt-1 grid gap-1.5">
            {d?.tournament.top.slice(0, 3).map((r) => (
              <span key={r.place} className="flex max-w-[280px] items-center gap-2 text-[12px]"><span>{MEDAL[r.place - 1]}</span><Avatar name={r.user} avatar={r.avatar} size={18}/><span className="min-w-0 flex-1 truncate text-white/75">{r.user}</span><span className="font-mono font-semibold text-emerald-300">{r.mult.toFixed(2)}×</span></span>
            ))}
            {d && !d.tournament.top.length && <span className="text-[12px] text-muted">Рейтинг пока пуст — начни свой путь</span>}
          </div>
        </div>
      </Link>
    </div>
  );
}
