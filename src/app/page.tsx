import Link from "next/link";
import { db } from "@/server/db";
import { GameRow } from "@/components/games/GameRow";
import { isGameSlug, POPULAR, type GameSlug } from "@/lib/games";

export const dynamic = "force-dynamic";

export default async function Home() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [games, rounds24, players, best] = await Promise.all([
    db.game.findMany({ orderBy: { sortOrder: "asc" } }),
    db.round.count({ where: { createdAt: { gte: since }, status: { not: "ACTIVE" } } }),
    db.user.count(),
    db.round.findFirst({ where: { status: "WON", createdAt: { gte: since } }, orderBy: { multiplier: "desc" }, select: { multiplier: true } }),
  ]);
  const list = games.filter((g) => isGameSlug(g.slug)).map((g) => ({ slug: g.slug as GameSlug, title: g.title, enabled: g.enabled }));
  const popular = POPULAR.map((s) => list.find((g) => g.slug === s)).filter((g): g is (typeof list)[number] => !!g);
  const recent = ["crash", "mines", "plinko", "roulette", "blackjack", "limbo"].map((s) => list.find((g) => g.slug === s)).filter((g): g is (typeof list)[number] => !!g);
  return (
    <div className="verdant-home mx-auto grid max-w-[1500px] gap-7">
      <section className="verdant-hero">
        <div className="verdant-hero-art" aria-hidden="true">
          <div className="hero-orb hero-orb-one"/><div className="hero-orb hero-orb-two"/>
          <div className="hero-rings"/><div className="hero-shards"><i/><i/><i/><i/></div>
        </div>
        <div className="verdant-hero-content">
          <span className="verdant-eyebrow"><i/> VERDANT ORIGINAL</span>
          <h1>ТВОЯ ИГРА.<br/><span>ТВОИ ПРАВИЛА.</span></h1>
          <p>Открой коллекцию игровых режимов и найди свой следующий любимый.</p>
          <Link href="/games" className="verdant-primary-btn"><span>▶</span> ОТКРЫТЬ ИГРЫ</Link>
        </div>
        <div className="verdant-hero-mark">V<span>.</span></div>
        <div className="verdant-hero-pagination"><i className="active"/><i/><i/></div>
      </section>

      <section className="verdant-stats" aria-label="Статистика платформы">
        {[["РАУНДОВ ЗА 24 ЧАСА", rounds24.toLocaleString("ru-RU"), "◈"],["ИГРОКОВ", players.toLocaleString("ru-RU"), "♟"],["ТОП МНОЖИТЕЛЬ", best ? `${Number(best.multiplier).toFixed(2)}×` : "—", "↗"]].map(([label,value,icon]) => <div key={label} className="verdant-stat"><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>)}
      </section>

      <div className="verdant-shelf"><GameRow title="Недавно в VERDANT" emoji="◈" games={recent} href="/games" /></div>
      <div className="verdant-shelf"><GameRow title="Популярные игры" emoji="✦" games={popular} href="/games" /></div>
      <div className="verdant-home-footer">VERDANT · Игровая платформа на виртуальных демо-кредитах. Без денежных ставок и вывода.</div>
    </div>
  );
}
