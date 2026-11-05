"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/account/ProgressUi";
import { api } from "@/lib/api";
import { points } from "@/lib/format";
import { sfx } from "@/lib/sound";

type Quest = { code: string; day: string; title: string; description: string; metric: string; target: number; reward: string; progress: number; completed: boolean; claimedAt: string | null };

function useCountdown(to: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!to) return "";
  const s = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Ежедневные задания: обновляются в 00:00 по Москве, прогресс считает сервер, награда — по кнопке, один раз. */
export default function QuestsPage() {
  const { setBalance } = useAuth();
  const [data, setData] = useState<{ day: string; resetsAt: string; items: Quest[] } | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState("");
  const load = useCallback(() => api<{ day: string; resetsAt: string; items: Quest[] }>("/api/quests").then(setData).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => { void load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, [load]);
  const left = useCountdown(data?.resetsAt ?? null);

  async function claim(q: Quest) {
    setBusy(`${q.day}:${q.code}`); setMsg("");
    try { const r = await api<{ reward: string; balance: string }>("/api/quests/claim", { body: { code: q.code, day: q.day } }); setBalance(r.balance); sfx("coins"); setMsg(`Награда ${points(r.reward)} зачислена`); await load(); }
    catch (e) { setMsg((e as Error).message); await load(); } finally { setBusy(null); }
  }
  if (err) return <p className="text-danger">{err}</p>;
  if (!data) return <div className="h-60 animate-pulse rounded-3xl bg-panel" />;
  const done = data.items.filter((q) => q.day === data.day && q.completed).length, today = data.items.filter((q) => q.day === data.day).length;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold">Задания дня</h1>
          <p className="text-[14px] text-muted">Выполнено {done} из {today}. Новые задания через <span className="font-mono text-soft" data-testid="quests-reset">{left}</span> (00:00 МСК).</p>
        </div>
        <Link href="/games"><Button variant="secondary">К играм</Button></Link>
      </div>
      {msg && <p className="rounded-xl bg-accent/10 px-3 py-2 text-[13.5px] text-accent" role="status">{msg}</p>}
      <ul className="grid gap-3 md:grid-cols-2" data-testid="quests">
        {data.items.map((q) => {
          const key = `${q.day}:${q.code}`; const old = q.day !== data.day;
          return (
            <li key={key} data-code={q.code} className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${q.claimedAt ? "border-line bg-panel/60 opacity-75" : q.completed ? "border-accent/40 bg-[linear-gradient(135deg,rgb(139_234_78/0.1),transparent)]" : "border-line bg-panel"}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{q.title}{old && <span className="ml-2 rounded-md bg-gold/15 px-1.5 py-0.5 text-[11px] text-gold">вчерашнее</span>}</p>
                <p className="text-[13px] text-muted">{q.description}</p>
                <div className="mt-2 max-w-xs"><ProgressBar value={q.progress} target={q.target} done={q.completed} /></div>
              </div>
              <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                <span className="font-mono text-[14px] font-semibold text-accent">+{points(q.reward)}</span>
                {q.claimedAt ? <span className="text-[13px] font-semibold text-muted">✓ Получено</span>
                  : <Button onClick={() => claim(q)} loading={busy === key} disabled={!q.completed || !!busy} data-testid={`claim-${q.code}`}>{q.completed ? "Забрать" : "В процессе"}</Button>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[12.5px] text-muted">Засчитываются раунды со ставкой от 1 кредита. Награды — виртуальные демо-кредиты, вывести их нельзя. Награду за выполненное задание можно забрать до конца следующего дня.</p>
    </div>
  );
}
