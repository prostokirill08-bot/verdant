import Image from "next/image";
import { TelegramLink } from "@/components/shell/TelegramLink";
import Link from "next/link";
import { db } from "@/server/db";
import { getSession } from "@/server/auth/session";
import { getPlatform } from "@/server/settings";
import { GameRow } from "@/components/games/GameRow";
import { PromoStrip } from "@/components/promo/PromoStrip";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { WinsTicker } from "@/components/home/WinsTicker";
import { HomePersonal } from "@/components/home/HomePersonal";
import { Button } from "@/components/ui/Button";
import { GAMES, isGameSlug, POPULAR, type GameSlug } from "@/lib/games";
import { points } from "@/lib/format";
import { gamePopularity } from "@/server/catalog";

export const dynamic = "force-dynamic";

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
  const by = (f: (s: GameSlug) => boolean) => list.filter((g) => f(g.slug));
  // Популярное — по реальному числу раундов за 7 дней; пока статистики нет — подборка по умолчанию
  const pop = await gamePopularity();
  const ranked = Object.entries(pop).sort((a, b) => b[1] - a[1]).map(([s]) => s).filter(isGameSlug);
  const popularSlugs = (ranked.length >= 4 ? ranked : [...ranked, ...POPULAR.filter((s) => !ranked.includes(s))]).slice(0, 8);
  const popular = popularSlugs.map((s) => list.find((g) => g.slug === s)).filter((g): g is (typeof list)[number] => !!g);

  return (
    <div className="grid gap-8 sm:gap-10">
      <HeroCarousel loggedIn={!!user} />
      <WinsTicker />
      <HomePersonal games={list} />

      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        {[["Раундов за сутки", rounds24.toLocaleString("ru-RU"), "#5b8cff"], ["Игроков", players.toLocaleString("ru-RU"), "#e8263f"], ["Лучший множитель", best ? `${Number(best.multiplier).toFixed(2)}×` : "—", "#ffd166"]].map(([k, v, c]) => (
          <div key={k} className="relative overflow-hidden rounded-2xl border border-line bg-panel p-3 sm:p-4">
            <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full blur-2xl" style={{ background: `${c}55` }} />
            <dt className="text-[11.5px] text-muted sm:text-[12.5px]">{k}</dt><dd className="mt-1 font-mono text-[17px] font-bold tabular sm:text-[24px]">{v}</dd>
          </div>
        ))}
      </dl>

      <GameRow title="Популярные" emoji="🔥" games={popular} href="/games?cat=popular" />
      <PromoStrip />
      <GameRow title="Новинки" emoji="✨" games={by((s) => GAMES[s].badge === "Новинка")} href="/games?sort=new" />
      <GameRow title="Новогодние слоты" emoji="🎁" games={by((s) => GAMES[s].category === "slots")} href="/games?cat=slots" />
      <GameRow title="Карточные игры" emoji="🃏" games={by((s) => GAMES[s].category === "table")} href="/games?cat=table" />
      <GameRow title="Быстрые игры" emoji="⚡" games={by((s) => GAMES[s].category === "originals")} href="/games?cat=originals" />

      <section className="snow-cap relative overflow-hidden rounded-[28px] border border-line bg-[linear-gradient(120deg,#16245e,#0f1633_55%,#4a0f22)] p-6 sm:p-8">
        <div className="relative z-10 max-w-md">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gold">🎁 Подарок дня</p>
          <h2 className="mt-2 font-display text-[24px] font-bold leading-tight sm:text-[30px]">{points(platform.dailyBonus)} от Котонавта</h2>
          <p className="mt-2 text-[15px] text-white/75">Котонавт в шапке Деда Мороза каждый день оставляет подарок под ёлкой. Заходи раз в сутки и забирай.</p>
          <Link href={user ? "/account" : "/register"} className="mt-5 inline-block"><Button size="lg" className="btn-shine">{user ? "Открыть подарок" : "Начать играть"}</Button></Link>
        </div>
        <Image src="/img/ny/mascot/cat.webp" alt="Котонавт в шапке Деда Мороза" width={300} height={300} className="animate-floaty pointer-events-none absolute -bottom-6 right-0 w-[150px] opacity-90 [mask-image:radial-gradient(circle,#000_55%,transparent_72%)] sm:right-6 sm:w-[260px] sm:opacity-100" />
      </section>

      <TelegramLink />

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["❄️", "Проверяемая честность", "Перед раундом виден хэш серверного сида, после смены пары — сам сид. Любой результат можно пересчитать.", "/fair"],
          ["🔔", "Баланс только на сервере", "Каждое движение средств — запись в журнале с уникальным ключом. Подделать баланс через браузер нельзя.", "/account/history"],
          ["🎅", "Никаких реальных денег", "Только бесплатные виртуальные демо-кредиты, без оплаты. Вывода нет. Это демо-платформа для игры и портфолио.", "/games"],
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
