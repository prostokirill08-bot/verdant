"use client";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { points } from "@/lib/format";
import { GAME_NAMES, isGameSlug } from "@/lib/games";

export type LbRow = { place: number; user: string; avatar: string; publicId: string | null; score?: number; mult?: number; game?: string; prize?: string; isMe?: boolean };
const medal = (p: number) => (p === 1 ? "bg-[linear-gradient(135deg,#f5d76e,#b8901f)] text-[#2a1d00]" : p === 2 ? "bg-[linear-gradient(135deg,#e5ecef,#8a979e)] text-[#1b2226]" : p === 3 ? "bg-[linear-gradient(135deg,#ffb37a,#a5592a)] text-[#2a1205]" : "bg-raised text-soft");

/** Таблица лидеров: место, игрок (ссылка на профиль, если он не скрыт), показатель и приз. */
export function LeaderRows({ rows, unit, empty }: { rows: LbRow[]; unit: "mult" | "count"; empty: string }) {
  if (!rows.length) return <p className="py-8 text-center text-[14px] text-muted">{empty}</p>;
  return (
    <ol className="grid gap-1.5" data-testid="leader-rows">
      {rows.map((r) => {
        const name = r.publicId ? <Link href={`/players/${r.publicId}`} className="truncate font-semibold hover:text-accent">{r.user}</Link> : <span className="truncate font-semibold text-soft">{r.user}</span>;
        return (
          <li key={r.place} className={`leader-row flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ${r.isMe ? "bg-accent/10 ring-accent/40" : "bg-ink/50 ring-line"}`}>
            <span className={`grid size-8 shrink-0 place-items-center rounded-xl font-mono text-[13px] font-bold ${medal(r.place)}`}>{r.place}</span>
            <Avatar name={r.user} avatar={r.avatar} size={32} />
            <div className="flex min-w-0 flex-1 flex-col">
              {name}
              {r.game && isGameSlug(r.game) && <span className="text-[12px] text-muted">{GAME_NAMES[r.game]}</span>}
            </div>
            <div className="text-right">
              <p className="font-mono text-[15px] font-semibold tabular">{unit === "mult" ? `${(r.mult ?? r.score ?? 0).toFixed(2)}×` : (r.score ?? 0).toLocaleString("ru-RU")}</p>
              {r.prize && BigInt(r.prize) > 0n && <p className="font-mono text-[11.5px] text-accent">+{points(r.prize)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
