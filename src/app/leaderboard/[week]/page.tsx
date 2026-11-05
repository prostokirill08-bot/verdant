"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { LeaderRows, type LbRow } from "@/components/leaderboard/Rows";
import { api } from "@/lib/api";

type D = { id: string; title: string; status: string; startsAt: string; endsAt: string; rows: LbRow[] };

/** Итоговая таблица турнира недели. */
export default function TournamentPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = use(params);
  const [d, setD] = useState<D | null>(null); const [err, setErr] = useState("");
  useEffect(() => { api<D>(`/api/tournaments/${encodeURIComponent(week)}`).then(setD).catch((e) => setErr((e as Error).message)); }, [week]);
  return (
    <div className="grid gap-4">
      <Link href="/leaderboard" className="text-[13.5px] text-accent hover:underline">← Все рейтинги</Link>
      {err ? <p className="text-danger">{err}</p> : !d ? <div className="h-72 animate-pulse rounded-3xl bg-panel" /> : (
        <section className="rounded-3xl border border-line bg-panel p-5">
          <h1 className="font-display text-[22px] font-bold">{d.title}</h1>
          <p className="mb-4 text-[13.5px] text-muted">{new Date(d.startsAt).toLocaleDateString("ru-RU")} — {new Date(new Date(d.endsAt).getTime() - 1).toLocaleDateString("ru-RU")} · {d.status === "FINISHED" ? "завершён" : "идёт сейчас"} · участников в таблице: {d.rows.length}</p>
          <LeaderRows rows={d.rows} unit="mult" empty="В этом турнире не было участников." />
        </section>
      )}
    </div>
  );
}
