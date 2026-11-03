import Image from "next/image";
import Link from "next/link";
import { db } from "@/server/db";
import { getSession } from "@/server/auth/session";
import { getPlatform } from "@/server/settings";
import { GameCard } from "@/components/games/GameCard";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { WinsTicker } from "@/components/home/WinsTicker";
import { Button } from "@/components/ui/Button";
import { GAMES, isGameSlug, type GameSlug } from "@/lib/games";
import { points } from "@/lib/format";

export const dynamic = "force-dynamic";

function SectionHead({ title, href, emoji }: { title: string; href: string; emoji: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-[21px] font-bold sm:text-[24px]"><span aria-hidden>{emoji}</span>{title}</h2>
      <Link href={href} className="rounded-xl bg-raised px-3 py-1.5 text-[13px] font-semibold text-soft hover:text-white">Все →</Link>
    </div>
  );
}

export default async function Home() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [games, user, rounds24, players, best, platform] = await Promise.all([
    db.game.findMany({ orderBy: { sortOrder: "asc" } }),
    getSession(),
    db.round.count({ where: { createdAt: { gte: since }, status: { not: "ACTIVE" } } }),
    db.user.count(),
    db.round.findFirst({ where: { status: "WON", createdAt: { gte: since } }, orderBy: { multiplier: "desc" }, select: { multiplier: true } }),
    getPlatform(),
  ]);
  const list = games.filter((g) => isGameSlug(g.slug)).map((g) => ({ slug: g.slug as GameSlug, title: g.title, enabled: g.enabled }));
  const slots = list.filter((g) => GAMES[g.slug].category === "slots");
  const originals = list.filter((g) => GAMES[g.slug].category === "originals");

  return (
    <div className="grid gap-8 sm:gap-10">
      <HeroCarousel loggedIn={!!user} />
      <WinsTicker />

      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        {[["Раундов за сутки", rounds24.toLocaleString("ru-RU"), "#5b8cff"], ["Игроков", players.toLocaleString("ru-RU"), "#e8263f"], ["Лучший множитель", best ? `${Number(best.multiplier).toFixed(2)}×` : "—", "#ffd166"]].map(([k, v, c]) => (
          <div key={k} className="relative overflow-hidden rounded-2xl border border-line bg-panel p-3 sm:p-4">
            <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full blur-2xl" style={{ background: `${c}55` }} />
            <dt className="text-[11.5px] text-muted sm:text-[12.5px]">{k}</dt><dd className="mt-1 font-mono text-[17px] font-bold tabular sm:text-[24px]">{v}</dd>
          </div>
        ))}
      </dl>

      {slots.length > 0 && (
        <section>
          <SectionHead title="Новогодние слоты" href="/games?cat=slots" emoji="🎁" />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {slots.map((g, i) => <GameCard key={g.slug} {...g} index={i} size="lg" />)}
          </div>
        </section>
      )}

      <section>
        <SectionHead title="Оригинальные игры" href="/games?cat=originals" emoji="🎄" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {originals.map((g, i) => <GameCard key={g.slug} {...g} index={i} />)}
        </div>
      </section>

      <section className="snow-cap relative overflow-hidden rounded-[28px] border border-line bg-[linear-gradient(120deg,#16245e,#0f1633_55%,#4a0f22)] p-6 sm:p-8">
        <div className="relative z-10 max-w-md">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gold">🎁 Подарок дня</p>
          <h2 className="mt-2 font-display text-[24px] font-bold leading-tight sm:text-[30px]">{points(platform.dailyBonus)} баллов от Котонавта</h2>
          <p className="mt-2 text-[15px] text-white/75">Котонавт в шапке Деда Мороза каждый день оставляет подарок под ёлкой. Заходи раз в сутки и забирай.</p>
          <Link href={user ? "/account" : "/register"} className="mt-5 inline-block"><Button size="lg" className="btn-shine">{user ? "Открыть подарок" : "Начать играть"}</Button></Link>
        </div>
        <Image src="/img/ny/mascot/cat.webp" alt="Котонавт в шапке Деда Мороза" width={300} height={300} className="animate-floaty pointer-events-none absolute -bottom-6 right-0 w-[150px] opacity-90 [mask-image:radial-gradient(circle,#000_55%,transparent_72%)] sm:right-6 sm:w-[260px] sm:opacity-100" />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["❄️", "Проверяемая честность", "Перед раундом виден хэш серверного сида, после смены пары — сам сид. Любой результат можно пересчитать.", "/fair"],
          ["🔔", "Баланс только на сервере", "Каждое движение баллов — запись в журнале с уникальным ключом. Подделать баланс через браузер нельзя.", "/account/history"],
          ["🎅", "Никаких реальных денег", "Баллы не покупаются и не выводятся. Это демо-платформа для игры и портфолио.", "/games"],
        ].map(([e, t, d, h]) => (
          <Link key={t} href={h!} className="group rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-brand/60">
            <span className="text-[26px]" aria-hidden>{e}</span>
            <p className="mt-2 font-semibold group-hover:text-white">{t}</p><p className="mt-1.5 text-[14px] leading-relaxed text-muted">{d}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
