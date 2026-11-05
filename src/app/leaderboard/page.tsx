"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LeaderRows, type LbRow } from "@/components/leaderboard/Rows";
import { api } from "@/lib/api";
import { points } from "@/lib/format";

type Tour = { week: string; title: string; enabled: boolean; minBet: string; startsAt: string; endsAt: string; prizes: string[]; rows: LbRow[]; myPlace: number | null };
type Hist = { id: string; title: string; startsAt: string; endsAt: string; participants: number; top: LbRow[] };
type Resp = { board: string | null; boards: Record<string, string>; tournament?: Tour; history?: Hist[]; rows?: LbRow[]; myPlace?: number | null };
const TABS: [string, string][] = [["tournament", "Турнир недели"], ["week_activity", "Активность недели"], ["rounds", "Раунды"], ["wins", "Победы"], ["best", "Лучший множитель"], ["achievements", "Достижения"]];
const fmt = (d: string) => new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000)); const d = Math.floor(s / 86400);
  return <span className="font-mono tabular">{d ? `${d} д ` : ""}{String(Math.floor((s % 86400) / 3600)).padStart(2, "0")}:{String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}

/** Рейтинги и турниры. Данные обновляются автоматически раз в 30 секунд. */
function Leaderboard() {
  const sp = useSearchParams(); const router = useRouter();
  const board = TABS.some(([k]) => k === sp.get("board")) ? sp.get("board")! : "tournament";
  const [data, setData] = useState<Resp | null>(null); const [err, setErr] = useState(""); const [at, setAt] = useState<Date | null>(null);
  const load = useCallback(() => api<Resp>(`/api/leaderboard?board=${board}`).then((r) => { setData(r); setAt(new Date()); setErr(""); }).catch((e) => setErr((e as Error).message)), [board]);
  useEffect(() => { setData(null); void load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  const t = data?.tournament;
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-[28px] font-bold">Рейтинг <span className="text-gradient">игроков</span></h1>
        <p className="mt-1 text-muted">Только реальные игроки и реальные раунды со ставкой от 1 ₽. Призы — виртуальные демо-рубли, без денежных призов.</p>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={board === k} onClick={() => router.replace(k === "tournament" ? "/leaderboard" : `/leaderboard?board=${k}`, { scroll: false })} data-testid={`board-${k}`}
            className={`h-10 shrink-0 rounded-lg px-3.5 text-[13px] font-semibold ${board === k ? "bg-[#3ee08f] text-[#03170c]" : "bg-[#0f1633] text-soft ring-1 ring-[#28325f] hover:text-white"}`}>{label}</button>
        ))}
      </div>
      {err && <p className="text-danger">{err}</p>}
      {!data ? <div className="h-72 animate-pulse rounded-3xl bg-panel" /> : board === "tournament" && t ? (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-3xl border border-line bg-panel p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[19px] font-bold">{t.title}</h2>
                <p className="text-[13px] text-muted">{fmt(t.startsAt)} — {fmt(new Date(new Date(t.endsAt).getTime() - 1).toISOString())} · лучший множитель раунда со ставкой от {points(t.minBet)}</p>
              </div>
              {t.enabled ? <p className="rounded-xl bg-accent/10 px-3 py-1.5 text-[13px] text-accent">До конца: <Countdown to={t.endsAt} /></p> : <p className="rounded-xl bg-warn/10 px-3 py-1.5 text-[13px] text-warn">Турнир на паузе</p>}
            </div>
            {t.myPlace && <p className="mb-3 text-[13.5px] text-soft">Твоё место сейчас: <b className="text-accent">{t.myPlace}</b></p>}
            <LeaderRows rows={t.rows} unit="mult" empty="Пока никто не выиграл раунд на этой неделе — стань первым." />
          </section>
          <div className="grid content-start gap-5">
            <section className="rounded-3xl border border-line bg-panel p-5">
              <h2 className="mb-3 font-display text-[17px] font-bold">Призы недели</h2>
              <ol className="grid gap-1 text-[13.5px]">
                {t.prizes.map((p, i) => BigInt(p) > 0n && <li key={i} className="flex justify-between rounded-lg px-2 py-1 odd:bg-ink/50"><span className="text-muted">{i + 1} место</span><span className="font-mono text-accent">{points(p)}</span></li>)}
              </ol>
            </section>
            <section className="rounded-3xl border border-line bg-panel p-5">
              <h2 className="mb-3 font-display text-[17px] font-bold">Завершённые турниры</h2>
              {data.history?.length ? (
                <ul className="grid gap-2" data-testid="tournament-history">
                  {data.history.map((h) => (
                    <li key={h.id}><Link href={`/leaderboard/${h.id}`} className="block rounded-2xl bg-ink/50 p-3 ring-1 ring-line hover:ring-accent/40">
                      <p className="flex justify-between gap-2 text-[14px] font-semibold"><span>{h.title}</span><span className="text-muted">{fmt(h.startsAt)}</span></p>
                      <p className="mt-1 truncate text-[12.5px] text-muted">{h.top.length ? h.top.map((r) => `${r.place}. ${r.user} (${(r.mult ?? 0).toFixed(2)}×)`).join(" · ") : "Без участников"}</p>
                    </Link></li>
                  ))}
                </ul>
              ) : <p className="text-[13.5px] text-muted">Первый турнир ещё идёт — итоги появятся здесь после его завершения.</p>}
            </section>
          </div>
        </div>
      ) : (
        <section className="rounded-3xl border border-line bg-panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-[19px] font-bold">{data.boards[board] ?? ""}</h2>
            {data.myPlace ? <p className="text-[13.5px] text-soft">Твоё место: <b className="text-accent">{data.myPlace}</b></p> : null}
          </div>
          <LeaderRows rows={data.rows ?? []} unit={board === "best" ? "mult" : "count"} empty="Пока нет данных для рейтинга." />
        </section>
      )}
      {at && <p className="text-[12px] text-muted">Обновлено в {at.toLocaleTimeString("ru-RU")} · автоматически каждые 30 секунд</p>}
    </div>
  );
}

export default function Page() { return <Suspense fallback={<div className="h-72 animate-pulse rounded-3xl bg-panel" />}><Leaderboard /></Suspense>; }
