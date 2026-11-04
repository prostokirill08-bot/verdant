import Link from "next/link";
import { TelegramLink } from "@/components/shell/TelegramLink";
import { db } from "@/server/db";
import { getSession } from "@/server/auth/session";
import { getPlatform } from "@/server/settings";
import { GameRow } from "@/components/games/GameRow";
import { PromoStrip } from "@/components/promo/PromoStrip";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { WinsTicker } from "@/components/home/WinsTicker";
import { Button } from "@/components/ui/Button";
import { GAMES, isGameSlug, POPULAR, type GameSlug } from "@/lib/games";
import { points } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [games, user, rounds24, players, best, platform] = await Promise.all([
    db.game.findMany({ orderBy: { sortOrder: "asc" } }), getSession(),
    db.round.count({ where: { createdAt: { gte: since }, status: { not: "ACTIVE" } } }),
    db.user.count(),
    db.round.findFirst({ where: { status: "WON", createdAt: { gte: since } }, orderBy: { multiplier: "desc" }, select: { multiplier: true } }),
    getPlatform(),
  ]);
  const list = games.filter((g) => isGameSlug(g.slug)).map((g) => ({ slug: g.slug as GameSlug, title: g.title, enabled: g.enabled }));
  const by = (f: (s: GameSlug) => boolean) => list.filter((g) => f(g.slug));
  const popular = POPULAR.map((s) => list.find((g) => g.slug === s)).filter((g): g is (typeof list)[number] => !!g);

  return (
    <div className="grid gap-9 sm:gap-11">
      <HeroCarousel loggedIn={!!user} />
      <WinsTicker />

      <dl className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {[
          ["Раундов за сутки", rounds24.toLocaleString("ru-RU"), "◈"],
          ["Участников", players.toLocaleString("ru-RU"), "✳"],
          ["Лучший множитель", best ? `${Number(best.multiplier).toFixed(2)}×` : "—", "↗"],
        ].map(([k,v,mark]) => (
          <div key={k} className="glass-panel relative overflow-hidden rounded-2xl p-3.5 sm:p-5">
            <div className="absolute -right-5 -top-8 size-24 rounded-full bg-emerald-400/[.08] blur-2xl"/>
            <dt className="relative text-[10px] font-semibold uppercase tracking-[.13em] text-muted sm:text-[11px]">{k}</dt>
            <dd className="relative mt-2 flex items-center gap-2 font-mono text-[17px] font-bold tabular text-[#e6fff0] sm:text-[25px]"><span className="text-[14px] text-accent">{mark}</span>{v}</dd>
          </div>
        ))}
      </dl>

      <GameRow title="Популярные игры" emoji="✦" games={popular} href="/games" />
      <PromoStrip />
      <GameRow title="Новые режимы" emoji="✧" games={by((s) => GAMES[s].badge === "Новинка")} href="/games?cat=new" />
      <GameRow title="Слоты и автоматы" emoji="◉" games={by((s) => GAMES[s].category === "slots")} href="/games?cat=slots" />
      <GameRow title="Классические игры" emoji="◇" games={by((s) => GAMES[s].category === "table")} href="/games?cat=table" />
      <GameRow title="Быстрые раунды" emoji="↗" games={by((s) => GAMES[s].category === "originals")} href="/games?cat=originals" />

      <section className="glass-panel relative isolate overflow-hidden rounded-[28px] p-6 sm:p-8">
        <div className="absolute -right-12 -top-20 size-72 rounded-full bg-emerald-400/[.12] blur-3xl"/>
        <div className="absolute -right-4 bottom-[-100px] size-64 rotate-45 rounded-[48px] border border-emerald-200/10 bg-gradient-to-br from-emerald-300/10 to-transparent"/>
        <div className="relative z-10 max-w-lg">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-emerald-300">DAILY DROP · КАЖДЫЙ ДЕНЬ</p>
          <h2 className="mt-3 font-display text-[25px] font-bold leading-tight sm:text-[32px]">Небольшой бонус.<br/><span className="text-gradient">Большой повод вернуться.</span></h2>
          <p className="mt-3 max-w-md text-[14px] leading-6 text-muted">Заглядывай каждый день, забирай виртуальные демо-кредиты и продолжай исследовать игровые режимы.</p>
          <Link href={user ? "/account" : "/register"} className="mt-5 inline-block"><Button size="lg" className="btn-shine !rounded-xl">{user ? "Открыть кабинет" : "Создать аккаунт"}</Button></Link>
        </div>
      </section>

      <TelegramLink />
      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["✧", "Проверяемая честность", "Проверяй игровые результаты и механику генерации.", "/fair"],
          ["◈", "Прозрачная история", "Все игровые события и изменения демо-баланса доступны в аккаунте.", "/account/history"],
          ["⬡", "Демо-формат", "Только виртуальные демо-кредиты. Нет денежных ставок, покупки кредитов или вывода.", "/games"],
        ].map(([e,t,d,h]) => (
          <Link key={t} href={h!} className="glass-panel group rounded-2xl p-5 transition-all hover:-translate-y-1 hover:border-emerald-300/30">
            <span className="grid size-10 place-items-center rounded-xl border border-emerald-200/10 bg-emerald-300/[.08] text-[20px] text-emerald-200">{e}</span>
            <p className="mt-4 font-semibold text-[#e7fff0] group-hover:text-emerald-200">{t}</p>
            <p className="mt-1.5 text-[13px] leading-6 text-muted">{d}</p>
          </Link>
        ))}
      </section>
      <p className="text-center text-[10px] tracking-wide text-muted/50">VERDANT · PLAY IN YOUR OWN RHYTHM</p>
    </div>
  );
}
