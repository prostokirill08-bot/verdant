"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, Loading, useAdminData, useIsAdmin } from "@/components/admin/ui";
import { DefEditor, type Def } from "@/components/admin/DefEditor";
import { AchIcon } from "@/components/account/ProgressUi";
import { points } from "@/lib/format";
import { ACHIEVEMENT_METRICS } from "@/lib/progress";

type Row = Def & { icon: string; unlocked: number };

/** Управление достижениями: условия, награды, иконки; сколько игроков уже получили. */
export default function AdminAchievements() {
  const { data, error, reload } = useAdminData<{ items: Row[] }>("/api/admin/achievements");
  const admin = useIsAdmin(); const [open, setOpen] = useState<string | null>(null);
  if (!data) return <Loading error={error} />;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] text-muted">Достижения выдаются сервером автоматически после ставок. Засчитываются раунды со ставкой от 1 DC. Награда начисляется один раз.</p>
        {admin && <Button onClick={() => setOpen(open === "new" ? null : "new")}>+ Новое достижение</Button>}
      </div>
      {open === "new" && <section className="rounded-2xl border border-accent/40 bg-panel p-4"><DefEditor kind="achievements" def={null} metrics={ACHIEVEMENT_METRICS} onSaved={() => { setOpen(null); void reload(); }} onCancel={() => setOpen(null)} /></section>}
      {data.items.map((a) => (
        <section key={a.code} className="rounded-2xl border border-line bg-panel p-4">
          <button type="button" onClick={() => setOpen(open === a.code ? null : a.code)} className="flex w-full items-center gap-3 text-left">
            <AchIcon icon={a.icon} done={a.enabled} size={42} />
            <div className="min-w-0 flex-1"><p className="font-semibold">{a.title} <span className="font-mono text-[12px] text-muted">{a.code}</span></p><p className="text-[13px] text-muted">{a.description} · {ACHIEVEMENT_METRICS[a.metric as keyof typeof ACHIEVEMENT_METRICS] ?? a.metric} ≥ {a.target} · награда {points(a.reward)}</p></div>
            <Badge tone={a.enabled ? "accent" : "muted"}>{a.enabled ? "Вкл" : "Выкл"}</Badge><Badge>{a.unlocked} получили</Badge>
          </button>
          {open === a.code && <div className="mt-4 border-t border-line pt-4"><DefEditor kind="achievements" def={a} metrics={ACHIEVEMENT_METRICS} readOnly={!admin} onSaved={() => { setOpen(null); void reload(); }} /></div>}
        </section>
      ))}
    </div>
  );
}
