import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { GamePlayer } from "@/components/play/GamePlayer";
import { GAMES, isGameSlug } from "@/lib/games";
import { points } from "@/lib/format";

export const dynamic = "force-dynamic";

// Игры, где RTP задаётся преимуществом платформы; у слотов, Plinko, рулетки, колеса и кено — свои таблицы
const EDGE_GAMES = new Set(["crash", "mines", "dice", "limbo", "coinflip", "tower", "hilo"]);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const g = isGameSlug(slug) ? await db.game.findUnique({ where: { slug } }) : null;
  return { title: g?.title ?? "Игра" };
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isGameSlug(slug)) notFound();
  const game = await db.game.findUnique({ where: { slug } });
  if (!game) notFound();
  const meta = GAMES[slug];
  const cfg = { slug, title: game.title, minBet: game.minBet.toString(), maxBet: game.maxBet.toString(), edgeBp: game.houseEdgeBp, enabled: game.enabled };
  const slot = meta.category === "slots";
  return (
    <div className="relative grid min-w-0 gap-5 overflow-x-clip [&>*]:min-w-0">
      {/* Тематическое свечение страницы в цветах игры */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-8 h-[420px] opacity-50 blur-3xl" style={{ background: `radial-gradient(500px 260px at 20% 30%, ${meta.theme[0]}55, transparent 70%), radial-gradient(500px 260px at 85% 20%, ${meta.theme[1]}40, transparent 70%)` }} />
      <div className="relative flex flex-wrap items-center gap-4">
        <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-xl ring-2" style={{ boxShadow: `0 10px 30px -10px ${meta.theme[0]}`, borderColor: meta.theme[0] }}>
          <Image src={meta.cover} alt="" fill sizes="48px" className="object-cover" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: meta.theme[0] }}>{slot ? "Слот" : "Оригинальная игра"}</p>
          <h1 className="font-display text-[26px] font-bold leading-tight">{game.title}</h1>
          <p className="text-muted">{game.tagline}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 text-[12.5px] sm:w-auto">
          <span className="rounded-lg bg-panel/80 px-2.5 py-1.5 text-soft ring-1 ring-line">Ставка {points(game.minBet)} – {points(game.maxBet)}</span>
          {EDGE_GAMES.has(slug) && <span className="rounded-lg bg-panel/80 px-2.5 py-1.5 text-soft ring-1 ring-line">RTP {(100 - game.houseEdgeBp / 100).toFixed(2)}%</span>}
          <Link href="/fair" className="rounded-lg bg-panel/80 px-2.5 py-1.5 text-accent ring-1 ring-line hover:ring-accent/50">🛡️ Честность</Link>
        </div>
      </div>
      {!game.enabled && <p className="relative rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-[14px] text-warn">Игра временно отключена администратором. Историю раундов можно посмотреть ниже.</p>}
      <div className="relative"><GamePlayer cfg={cfg} /></div>
    </div>
  );
}
