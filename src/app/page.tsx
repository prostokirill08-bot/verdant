import Link from "next/link";
import { db } from "@/server/db";
import { getSession } from "@/server/auth/session";
import { GameCard } from "@/components/games/GameCard";
import { Button } from "@/components/ui/Button";
import { isGameSlug } from "@/lib/games";
import { points } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [games, user, rounds24, players, best] = await Promise.all([
    db.game.findMany({ orderBy: { sortOrder: "asc" } }),
    getSession(),
    db.round.count({ where: { createdAt: { gte: since }, status: { not: "ACTIVE" } } }),
    db.user.count(),
    db.round.findFirst({ where: { status: "WON", createdAt: { gte: since } }, orderBy: { multiplier: "desc" }, select: { multiplier: true, gameSlug: true } }),
  ]);

  return (
    <div className="grid gap-10">
      <section className="relative overflow-hidden rounded-[28px] border border-line bg-panel px-6 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -right-24 -top-32 size-[420px] rounded-full bg-accent/20 blur-[100px]" aria-hidden />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background:linear-gradient(#fff_1px,transparent_1px)_0_0/100%_44px,linear-gradient(90deg,#fff_1px,transparent_1px)_0_0/44px_100%]" aria-hidden />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[12px] font-semibold text-accent">
            <span className="size-1.5 rounded-full bg-accent" /> Демо-режим · виртуальные баллы
          </span>
          <h1 className="mt-5 font-display text-[clamp(30px,5vw,54px)] font-bold leading-[1.02] tracking-tight [text-wrap:balance]">
            Шесть мини-игр.<br /><span className="text-accent">Честный</span> результат каждого раунда.
          </h1>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-soft">
            Исход считает сервер на криптостойком генераторе. Хэш сида виден до игры, сам сид — после, так что любой раунд можно проверить.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {user ? <Link href="/games"><Button size="lg">Играть</Button></Link> : <>
              <Link href="/register"><Button size="lg">Получить 1 000 демо-баллов</Button></Link>
              <Link href="/login"><Button size="lg" variant="secondary">У меня есть аккаунт</Button></Link>
            </>}
          </div>
        </div>
        <dl className="relative mt-10 grid max-w-2xl grid-cols-3 gap-4 border-t border-line pt-6">
          {[["Раундов за сутки", rounds24.toLocaleString("ru-RU")], ["Игроков", players.toLocaleString("ru-RU")], ["Лучший множитель за сутки", best ? `${Number(best.multiplier).toFixed(2)}×` : "—"]].map(([k, v]) => (
            <div key={k}><dt className="text-[12px] text-muted">{k}</dt><dd className="mt-1 font-mono text-[22px] font-semibold tabular">{v}</dd></div>
          ))}
        </dl>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-[22px] font-bold">Игры</h2>
          <Link href="/games" className="text-[14px] font-semibold text-accent hover:underline">Все игры →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {games.filter((g) => isGameSlug(g.slug)).map((g, i) => (
            <GameCard key={g.slug} slug={g.slug as never} title={g.title} tagline={g.tagline} enabled={g.enabled} index={i} />
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["Проверяемая честность", "Перед раундом ты видишь SHA-256 серверного сида. После смены пары сидов можно пересчитать любой результат."],
          ["Баланс только на сервере", "Каждое изменение — запись в журнале с уникальным ключом. Повторное списание и правка через DevTools невозможны."],
          [`Ежедневный бонус ${points(25000)} баллов`, "Баллы не покупаются и не выводятся. Закончились — забери бонус в кабинете раз в сутки."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-line bg-panel p-5">
            <p className="font-semibold">{t}</p><p className="mt-2 text-[14px] leading-relaxed text-muted">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
