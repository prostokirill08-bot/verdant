"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { GameRow } from "@/components/games/GameRow";
import { useGameModal } from "@/components/games/GameModal";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { GAMES, type GameSlug } from "@/lib/games";

type G = { slug: GameSlug; title: string; enabled: boolean };

/** Личные полки на главной: «Продолжить игру», «Недавно играли» и «Избранное» — по данным аккаунта. */
export function HomePersonal({ games }: { games: G[] }) {
  const { user } = useAuth(); const { favs } = useGameModal();
  const [recent, setRecent] = useState<{ slug: GameSlug; at: string }[]>([]);
  useEffect(() => {
    if (!user) { setRecent([]); return; }
    api<{ recent: { slug: string; at: string }[] }>("/api/me/recent").then((r) => setRecent(r.recent.filter((x): x is { slug: GameSlug; at: string } => x.slug in GAMES))).catch(() => {});
  }, [user]);
  const pick = (slugs: GameSlug[]) => slugs.map((s) => games.find((g) => g.slug === s)).filter((g): g is G => !!g);
  const last = recent[0];
  return (
    <>
      {last && (
        <Link href={`/games/${last.slug}`} data-testid="continue-game" className="group flex items-center gap-3 rounded-2xl border border-accent/25 bg-[linear-gradient(90deg,rgb(62_224_143/0.12),transparent)] p-3 pr-4 transition-colors hover:border-accent/60">
          <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10"><Image src={GAMES[last.slug].cover} alt="" fill sizes="64px" className="object-cover" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] font-bold uppercase tracking-[0.12em] text-accent">Продолжить игру</span>
            <span className="block truncate font-display text-[16px] font-bold">{games.find((g) => g.slug === last.slug)?.title ?? GAMES[last.slug].name}</span>
            <span className="block text-[12px] text-muted">Последний раунд {timeAgo(last.at)}</span>
          </span>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition-transform group-hover:scale-110" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg></span>
        </Link>
      )}
      {recent.length > 0 && <GameRow title="Недавно играли" emoji="◷" games={pick(recent.map((r) => r.slug))} href="/games?cat=recent" />}
      {favs.length > 0 && <GameRow title="Избранное" emoji="♥" games={pick(favs)} href="/games?cat=fav" />}
    </>
  );
}
