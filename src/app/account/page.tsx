"use client";
import { sfx } from "@/lib/sound";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { GameCard } from "@/components/games/GameCard";
import { AchIcon, Panel } from "@/components/account/ProgressUi";
import { api } from "@/lib/api";
import { points, timeAgo } from "@/lib/format";
import { GAMES, isGameSlug } from "@/lib/games";
import { isGuestEmail } from "@/lib/guest";

type Overview = {
  user: { publicId: string; username: string; email: string; avatar: string; role: string; createdAt: string };
  balance: string; bonus: { amount: string; availableAt: string | null };
  profile: { rounds: number; wins: number; winRate: number; wagered: string; returned: string; best: number; gamesPlayed: number; favorite: { slug: string; rounds: number } | null; activeDays: number; streak: number; achievements: number };
  recent: { slug: string; at: string }[];
  sessions: { start: string; end: string; minutes: number; rounds: number; wins: number; wagered: string; net: string; games: { slug: string; rounds: number }[] }[];
  favorites: string[];
  achievements: { unlocked: number; total: number; latest: { code: string; title: string; icon: string; unlockedAt: string }[] };
};
const gameName = (s: string) => (isGameSlug(s) ? GAMES[s].name : s);

/** Личный кабинет: карточка игрока, статистика, избранное, сессии и достижения. Все цифры считает сервер. */
export default function AccountPage() {
  const { setBalance, user } = useAuth();
  const [s, setS] = useState<Overview | null>(null); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const [check, setCheck] = useState<{ ok: boolean; balance: string; ledger: string } | null>(null);
  const load = useCallback(async () => { try { setS(await api<Overview>("/api/me/overview")); } catch (e) { setErr((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function bonus() {
    setBusy(true); setMsg("");
    try { const r = await api<{ balance: string }>("/api/account/bonus", { method: "POST" }); setBalance(r.balance); sfx("coins"); setMsg(`Начислено ${points(s!.bonus.amount)}`); await load(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  async function verify() { try { setCheck(await api("/api/account/verify")); } catch (e) { setMsg((e as Error).message); } }

  if (err) return <p className="text-danger">{err}</p>;
  if (!s) return <div className="grid gap-4"><div className="h-56 animate-pulse rounded-3xl bg-panel" /><div className="h-40 animate-pulse rounded-3xl bg-panel" /></div>;
  const p = s.profile; const net = BigInt(p.returned) - BigInt(p.wagered);
  const guest = isGuestEmail(user?.email);
  const stats: [string, string, string?][] = [
    ["Сыграно раундов", p.rounds.toLocaleString("ru-RU")],
    ["Побед", `${p.wins.toLocaleString("ru-RU")}`, p.rounds ? `${(p.winRate * 100).toFixed(1)}% раундов` : undefined],
    ["Лучший множитель", p.best ? `${p.best.toFixed(2)}×` : "—"],
    ["Любимая игра", p.favorite ? gameName(p.favorite.slug) : "—", p.favorite ? `${p.favorite.rounds} раундов` : undefined],
    ["Разных игр", `${p.gamesPlayed} из ${Object.keys(GAMES).length}`],
    ["Дней активности", p.activeDays.toLocaleString("ru-RU"), p.streak > 1 ? `${p.streak} дня подряд` : undefined],
    ["Поставлено", points(p.wagered)],
    ["Итог игры", (net > 0n ? "+" : "") + points(net)],
  ];
  return (
    <div className="verdant-account grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl border border-line bg-panel p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-accent/15 blur-3xl" aria-hidden />
          <div className="relative flex items-center gap-4">
            <Avatar name={s.user.username} avatar={s.user.avatar} size={64} />
            <div className="min-w-0">
              <p className="truncate font-display text-[22px] font-bold" data-testid="profile-name">{s.user.username}</p>
              <p className="font-mono text-[13px] text-muted">ID <span className="text-soft" data-testid="profile-id">{s.user.publicId}</span></p>
              <p className="text-[13px] text-muted">На платформе с {new Date(s.user.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
          </div>
          <p className="relative mt-6 text-[12px] font-semibold uppercase tracking-wider text-muted">Баланс демо-рублей</p>
          <p className="relative mt-1 font-mono text-[36px] font-semibold leading-none tabular sm:text-[40px]">{points(s.balance)}</p>
          <div className="relative mt-5 flex flex-wrap items-center gap-2">
            <Button onClick={bonus} loading={busy} disabled={!!s.bonus.availableAt}>
              {s.bonus.availableAt ? `Награда после ${new Date(s.bonus.availableAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : `Ежедневная награда ${points(s.bonus.amount)}`}
            </Button>
            <Link href="/account/quests"><Button variant="secondary">Задания дня</Button></Link>
            <Button variant="ghost" onClick={verify}>Сверить баланс</Button>
          </div>
          {msg && <p className="relative mt-3 text-[13.5px] text-soft">{msg}</p>}
          {check && <p className={`relative mt-3 text-[13.5px] ${check.ok ? "text-accent" : "text-danger"}`}>{check.ok ? `Сверка пройдена: баланс совпадает с журналом (${points(check.ledger)})` : "Расхождение баланса и журнала — сообщи в поддержку"}</p>}
          {guest && <p className="relative mt-4 rounded-xl bg-gold/10 px-3 py-2 text-[13px] text-gold">Гостевой аккаунт хранится 3 дня. <Link href="/register" className="font-semibold underline">Зарегистрируйся</Link>, чтобы сохранить прогресс и достижения.</p>}
        </motion.section>
        <section className="grid grid-cols-2 gap-3" aria-label="Статистика">
          {stats.map(([k, v, sub]) => (
            <div key={k} className="min-w-0 rounded-2xl border border-line bg-panel p-3.5 sm:p-4">
              <p className="text-[12px] text-muted">{k}</p>
              <p className="mt-1 truncate font-mono text-[17px] font-semibold tabular sm:text-[19px]">{v}</p>
              {sub && <p className="text-[11.5px] text-muted">{sub}</p>}
            </div>
          ))}
        </section>
      </div>

      <Panel title={`Достижения · ${s.achievements.unlocked} из ${s.achievements.total}`} action={<Link href="/account/achievements" className="text-[13px] font-semibold text-accent hover:underline">Все</Link>}>
        {s.achievements.latest.length ? (
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {s.achievements.latest.map((a) => (
              <div key={a.code} className="flex w-[150px] shrink-0 flex-col items-center gap-2 rounded-2xl bg-ink/60 p-3 text-center ring-1 ring-line">
                <AchIcon icon={a.icon} done />
                <p className="text-[13px] font-semibold leading-tight">{a.title}</p>
                <p className="text-[11px] text-muted">{new Date(a.unlockedAt).toLocaleDateString("ru-RU")}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-[14px] text-muted">Пока нет достижений. Сыграй первый раунд — и получишь «Первый запуск».</p>}
      </Panel>

      <Panel title="Избранные игры" action={<Link href="/games?cat=fav" className="text-[13px] font-semibold text-accent hover:underline">В каталоге</Link>}>
        {s.favorites.filter(isGameSlug).length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {s.favorites.filter(isGameSlug).map((g, i) => <GameCard key={g} slug={g} index={i} />)}
          </div>
        ) : <p className="text-[14px] text-muted">Нажми ♥ на карточке игры — она появится здесь и на главной.</p>}
      </Panel>

      <Panel title="Игровые сессии" action={<Link href="/account/history?tab=rounds" className="text-[13px] font-semibold text-accent hover:underline">Все раунды</Link>}>
        {s.sessions.length ? (
          <ul className="grid gap-2" data-testid="sessions">
            {s.sessions.map((x) => {
              const n = BigInt(x.net);
              return (
                <li key={x.start} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-ink/60 px-4 py-3 ring-1 ring-line">
                  <div className="flex -space-x-2">{x.games.slice(0, 3).map((g) => isGameSlug(g.slug) && <span key={g.slug} className="relative size-8 overflow-hidden rounded-lg ring-2 ring-panel"><Image src={GAMES[g.slug].cover} alt="" fill sizes="32px" className="object-cover" /></span>)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{x.games.map((g) => gameName(g.slug)).join(", ")}</p>
                    <p className="text-[12px] text-muted">{new Date(x.start).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {x.minutes} мин · {x.rounds} раунд.</p>
                  </div>
                  <p className={`font-mono text-[14px] font-semibold tabular ${n > 0n ? "text-accent" : n < 0n ? "text-soft" : "text-muted"}`}>{n > 0n ? "+" : ""}{points(n)}</p>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-[14px] text-muted">Сессий пока нет. Здесь появятся твои игровые заходы: время, игры и итог.</p>}
      </Panel>

      {s.recent.length > 0 && (
        <p className="text-[13px] text-muted">Последняя игра: <Link href={`/games/${s.recent[0]!.slug}`} className="font-semibold text-accent hover:underline">{gameName(s.recent[0]!.slug)}</Link> · {timeAgo(s.recent[0]!.at)}</p>
      )}
    </div>
  );
}
