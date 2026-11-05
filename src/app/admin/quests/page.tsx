"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, inputCls, Loading, Msg, useAction, useAdminData, useIsAdmin } from "@/components/admin/ui";
import { DefEditor, type Def } from "@/components/admin/DefEditor";
import { api } from "@/lib/api";
import { points } from "@/lib/format";
import { QUEST_METRICS } from "@/lib/progress";

type Row = Def & { pinned: boolean; completedToday: number; claimedToday: number };

/** Управление ежедневными заданиями: шаблоны, награды, сколько заданий в день, статистика за сегодня. */
export default function AdminQuests() {
  const { data, error, reload } = useAdminData<{ day: string; dailyCount: number; today: string[]; items: Row[] }>("/api/admin/quests");
  const admin = useIsAdmin(); const [open, setOpen] = useState<string | null>(null);
  const act = useAction(); const [count, setCount] = useState<string | null>(null);
  if (!data) return <Loading error={error} />;
  return (
    <div className="grid gap-3">
      <section className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-line bg-panel p-4">
        <div><p className="font-semibold">Сегодня ({data.day}, МСК)</p><p className="text-[13px] text-muted">Выдано: {data.today.map((c) => data.items.find((i) => i.code === c)?.title ?? c).join(", ") || "—"}</p></div>
        <div className="flex items-end gap-2">
          <label className="grid gap-1"><span className="text-[11.5px] uppercase tracking-wider text-muted">Заданий в день</span><input value={count ?? String(data.dailyCount)} onChange={(e) => setCount(e.target.value)} className={`${inputCls} w-24 font-mono`} inputMode="numeric" disabled={!admin} /></label>
          {admin && <Button variant="secondary" loading={act.busy} onClick={() => act.run(() => api("/api/admin/quests/settings", { method: "PUT", body: { dailyCount: Number(count ?? data.dailyCount) } }), "Сохранено").then((r) => r && reload())}>Сохранить</Button>}
          {admin && <Button onClick={() => setOpen(open === "new" ? null : "new")}>+ Задание</Button>}
        </div>
      </section>
      <Msg m={act.msg} />
      {open === "new" && <section className="rounded-2xl border border-accent/40 bg-panel p-4"><DefEditor kind="quests" def={null} metrics={QUEST_METRICS} onSaved={() => { setOpen(null); void reload(); }} onCancel={() => setOpen(null)} /></section>}
      {data.items.map((q) => (
        <section key={q.code} className="rounded-2xl border border-line bg-panel p-4">
          <button type="button" onClick={() => setOpen(open === q.code ? null : q.code)} className="flex w-full flex-wrap items-center gap-2 text-left">
            <div className="min-w-0 flex-1"><p className="font-semibold">{q.title} <span className="font-mono text-[12px] text-muted">{q.code}</span></p><p className="text-[13px] text-muted">{q.description} · {QUEST_METRICS[q.metric as keyof typeof QUEST_METRICS] ?? q.metric} ≥ {q.target} · награда {points(q.reward)}</p></div>
            {q.pinned && <Badge tone="warn">Каждый день</Badge>}{data.today.includes(q.code) && <Badge tone="accent">Сегодня</Badge>}
            <Badge tone={q.enabled ? "accent" : "muted"}>{q.enabled ? "Вкл" : "Выкл"}</Badge><Badge>выполнили {q.completedToday} · забрали {q.claimedToday}</Badge>
          </button>
          {open === q.code && <div className="mt-4 border-t border-line pt-4"><DefEditor kind="quests" def={q} metrics={QUEST_METRICS} readOnly={!admin} onSaved={() => { setOpen(null); void reload(); }} /></div>}
        </section>
      ))}
    </div>
  );
}
