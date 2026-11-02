import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { GameIcon } from "@/components/games/GameIcon";
import { GamePlayer } from "@/components/play/GamePlayer";
import { isGameSlug } from "@/lib/games";
import { points } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const g = isGameSlug(slug) ? await db.game.findUnique({ where: { slug } }) : null;
  return { title: g?.title ?? "Игра" };
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isGameSlug(slug)) notFound();
  const game = await db.game.findUnique({ where: { slug } });
  if (!game) notFound();
  const cfg = { slug, title: game.title, minBet: game.minBet.toString(), maxBet: game.maxBet.toString(), edgeBp: game.houseEdgeBp, enabled: game.enabled };
  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 place-items-center rounded-2xl bg-panel text-accent ring-1 ring-line"><GameIcon slug={slug} size={26} /></span>
        <div className="min-w-0 flex-1"><h1 className="font-display text-[26px] font-bold">{game.title}</h1><p className="text-muted">{game.tagline}</p></div>
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          <span className="rounded-lg bg-panel px-2.5 py-1.5 text-soft ring-1 ring-line">Ставка {points(game.minBet)} – {points(game.maxBet)}</span>
          {slug !== "plinko" && slug !== "roulette" && <span className="rounded-lg bg-panel px-2.5 py-1.5 text-soft ring-1 ring-line">RTP {(100 - game.houseEdgeBp / 100).toFixed(2)}%</span>}
          <Link href="/fair" className="rounded-lg bg-panel px-2.5 py-1.5 text-accent ring-1 ring-line hover:ring-accent/50">Проверка честности</Link>
        </div>
      </div>
      {!game.enabled && <p className="rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-[14px] text-warn">Игра временно отключена администратором. Историю раундов можно посмотреть ниже.</p>}
      <GamePlayer cfg={cfg} />
    </div>
  );
}
