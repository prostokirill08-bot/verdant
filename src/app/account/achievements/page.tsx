"use client";
import { useEffect, useState } from "react";
import { AchIcon, ProgressBar } from "@/components/account/ProgressUi";
import { api } from "@/lib/api";
import { points } from "@/lib/format";
import { ACHIEVEMENT_METRICS } from "@/lib/progress";

type Item = { code: string; title: string; description: string; icon: string; metric: string; target: number; reward: string; progress: number; unlockedAt: string | null };

/** Достижения: условия, прогресс, награда и дата получения. Выдаёт их сервер автоматически. */
export default function AchievementsPage() {
  const [items, setItems] = useState<Item[] | null>(null); const [err, setErr] = useState("");
  const [filter, setFilter] = useState<"all" | "done" | "open">("all");
  useEffect(() => { api<{ items: Item[] }>("/api/achievements").then((r) => setItems(r.items)).catch((e) => setErr((e as Error).message)); }, []);
  if (err) return <p className="text-danger">{err}</p>;
  if (!items) return <div className="h-60 animate-pulse rounded-3xl bg-panel" />;
  const done = items.filter((i) => i.unlockedAt).length;
  const shown = items.filter((i) => (filter === "done" ? i.unlockedAt : filter === "open" ? !i.unlockedAt : true))
    .sort((a, b) => (a.unlockedAt ? 1 : 0) - (b.unlockedAt ? 1 : 0) || b.progress / b.target - a.progress / a.target);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold">Достижения</h1>
          <p className="text-[14px] text-muted">Получено {done} из {items.length}. Засчитываются раунды со ставкой от 1 ₽; награды — демо-рубли.</p>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Фильтр">
          {([["all", "Все"], ["open", "В процессе"], ["done", "Получены"]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${filter === k ? "bg-accent text-accent-ink" : "bg-raised text-soft hover:text-white"}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full bg-[linear-gradient(90deg,#1f9d55,#7cf5b6)]" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="achievements">
        {shown.map((a) => (
          <li key={a.code} data-code={a.code} data-done={a.unlockedAt ? "1" : "0"} className={`flex gap-3 rounded-2xl border p-4 ${a.unlockedAt ? "border-accent/35 bg-[linear-gradient(135deg,rgb(62_224_143/0.08),transparent)]" : "border-line bg-panel"}`}>
            <AchIcon icon={a.icon} done={!!a.unlockedAt} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold leading-tight">{a.title}</p>
                {BigInt(a.reward) > 0n && <span className="shrink-0 rounded-md bg-accent/10 px-1.5 py-0.5 font-mono text-[11.5px] text-accent">+{points(a.reward)}</span>}
              </div>
              <p className="mt-0.5 text-[13px] text-muted">{a.description}</p>
              <div className="mt-2">
                {a.unlockedAt
                  ? <p className="text-[12.5px] font-semibold text-accent">Получено {new Date(a.unlockedAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
                  : <ProgressBar value={a.progress} target={a.target} />}
              </div>
              <p className="mt-1 text-[11px] text-muted/80">Условие: {ACHIEVEMENT_METRICS[a.metric as keyof typeof ACHIEVEMENT_METRICS] ?? a.metric} — {a.target.toLocaleString("ru-RU")}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
