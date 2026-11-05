"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { AchIcon } from "@/components/account/ProgressUi";
import { api } from "@/lib/api";
import { points } from "@/lib/format";
import { GAME_NAMES, isGameSlug } from "@/lib/games";

type P = {
  publicId: string; user: string; avatar: string; since: string;
  stats: { rounds: number; wins: number; best: number; activeDays: number; favorite: string | null };
  achievements: { code: string; title: string; icon: string; description: string; at: string }[];
  tournaments: { id: string; title: string; place: number; mult: number; prize: string }[];
};

/** Публичный профиль участника: только открытые данные (без баланса и почты). Анонимные игроки профиля не имеют. */
export default function PlayerPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = use(params);
  const [p, setP] = useState<P | null>(null); const [err, setErr] = useState("");
  useEffect(() => { api<P>(`/api/players/${encodeURIComponent(publicId)}`).then(setP).catch((e) => setErr((e as Error).message)); }, [publicId]);
  if (err) return <div className="grid gap-3"><Link href="/leaderboard" className="text-accent hover:underline">← Рейтинг</Link><p className="rounded-2xl border border-line bg-panel p-6 text-muted">{err}</p></div>;
  if (!p) return <div className="h-72 animate-pulse rounded-3xl bg-panel" />;
  const stats: [string, string][] = [["Раундов", p.stats.rounds.toLocaleString("ru-RU")], ["Побед", p.stats.wins.toLocaleString("ru-RU")], ["Лучший множитель", p.stats.best ? `${p.stats.best.toFixed(2)}×` : "—"], ["Дней активности", String(p.stats.activeDays)], ["Любимая игра", p.stats.favorite && isGameSlug(p.stats.favorite) ? GAME_NAMES[p.stats.favorite] : "—"]];
  return (
    <div className="grid gap-4">
      <Link href="/leaderboard" className="text-[13.5px] text-accent hover:underline">← Рейтинг</Link>
      <section className="flex flex-wrap items-center gap-4 rounded-3xl border border-line bg-panel p-5">
        <Avatar name={p.user} avatar={p.avatar} size={64} />
        <div className="min-w-0"><h1 className="truncate font-display text-[24px] font-bold" data-testid="player-name">{p.user}</h1><p className="text-[13px] text-muted">ID {p.publicId} · на платформе с {new Date(p.since).toLocaleDateString("ru-RU")}</p></div>
      </section>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([k, v]) => <div key={k} className="min-w-0 rounded-2xl border border-line bg-panel p-4"><p className="text-[12px] text-muted">{k}</p><p className="mt-1 truncate font-mono text-[18px] font-semibold">{v}</p></div>)}
      </section>
      <section className="rounded-3xl border border-line bg-panel p-5">
        <h2 className="mb-3 font-display text-[17px] font-bold">Достижения · {p.achievements.length}</h2>
        {p.achievements.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{p.achievements.map((a) => (
          <div key={a.code} className="flex items-center gap-3 rounded-2xl bg-ink/50 p-3 ring-1 ring-line"><AchIcon icon={a.icon} done size={40} /><div className="min-w-0"><p className="truncate text-[14px] font-semibold">{a.title}</p><p className="text-[12px] text-muted">{new Date(a.at).toLocaleDateString("ru-RU")}</p></div></div>
        ))}</div> : <p className="text-[14px] text-muted">Достижений пока нет.</p>}
      </section>
      <section className="rounded-3xl border border-line bg-panel p-5">
        <h2 className="mb-3 font-display text-[17px] font-bold">Турниры</h2>
        {p.tournaments.length ? <ul className="grid gap-2">{p.tournaments.map((t) => (
          <li key={t.id}><Link href={`/leaderboard/${t.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-ink/50 px-4 py-3 ring-1 ring-line hover:ring-accent/40">
            <span className="text-[14px]">{t.title} · {new Date(t.id).toLocaleDateString("ru-RU")}</span>
            <span className="text-right text-[13.5px]"><b className="text-accent">{t.place} место</b> · {t.mult.toFixed(2)}×{BigInt(t.prize) > 0n ? ` · ${points(t.prize)}` : ""}</span>
          </Link></li>
        ))}</ul> : <p className="text-[14px] text-muted">Пока без мест в завершённых турнирах.</p>}
      </section>
    </div>
  );
}
