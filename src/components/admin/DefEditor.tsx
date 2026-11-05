"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputCls, Msg, useAction } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { unitsToInput } from "@/components/play/kit";
import { ACH_ICONS } from "@/lib/progress";
import { AchIcon } from "@/components/account/ProgressUi";

export type Def = { code: string; title: string; description: string; metric: string; target: number; reward: string; enabled: boolean; sortOrder: number; icon?: string; pinned?: boolean };
type Kind = "achievements" | "quests";

/** Форма создания/редактирования достижения или задания (общая для двух разделов админки). */
export function DefEditor({ kind, def, metrics, onSaved, onCancel, readOnly }: { kind: Kind; def: Def | null; metrics: Record<string, string>; onSaved: () => void; onCancel?: () => void; readOnly?: boolean }) {
  const creating = !def;
  const [f, setF] = useState({
    code: def?.code ?? "", title: def?.title ?? "", description: def?.description ?? "", metric: def?.metric ?? Object.keys(metrics)[0]!, target: String(def?.target ?? 1),
    reward: def ? unitsToInput(BigInt(def.reward)) : "10", enabled: def?.enabled ?? true, sortOrder: String(def?.sortOrder ?? 50), icon: def?.icon ?? "star", pinned: def?.pinned ?? false,
  });
  const act = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const payload = () => ({
    code: f.code.trim(), title: f.title, description: f.description, metric: f.metric, target: Number(f.target), reward: f.reward.replace(",", ".") || "0", enabled: f.enabled, sortOrder: Number(f.sortOrder) || 0,
    ...(kind === "achievements" ? { icon: f.icon } : { pinned: f.pinned }),
  });
  const save = () => act.run(() => api(creating ? `/api/admin/${kind}` : `/api/admin/${kind}/${def!.code}`, { method: creating ? "POST" : "PUT", body: payload() }), "Сохранено").then((r) => r && onSaved());
  const del = () => { if (confirm(`Удалить «${def!.title}»? Выданные отметки тоже удалятся (начисленные награды остаются в журнале).`)) void act.run(() => api(`/api/admin/${kind}/${def!.code}`, { method: "DELETE" }), "Удалено").then((r) => r && onSaved()); };
  return (
    <div className="grid gap-3">
      <fieldset disabled={readOnly || act.busy} className="grid gap-2 sm:grid-cols-2">
        <L t="Код (латиница)"><input value={f.code} onChange={set("code")} disabled={!creating} className={`${inputCls} font-mono`} placeholder="rounds_500" /></L>
        <L t="Название"><input value={f.title} onChange={set("title")} className={inputCls} maxLength={60} /></L>
        <L t="Описание" wide><input value={f.description} onChange={set("description")} className={inputCls} maxLength={200} /></L>
        <L t="Условие (метрика)"><select value={f.metric} onChange={set("metric")} className={inputCls}>{Object.entries(metrics).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></L>
        <L t="Цель (сколько нужно)"><input value={f.target} onChange={set("target")} className={`${inputCls} font-mono`} inputMode="numeric" /></L>
        <L t="Награда, ₽"><input value={f.reward} onChange={set("reward")} className={`${inputCls} font-mono`} inputMode="decimal" /></L>
        <L t="Порядок"><input value={f.sortOrder} onChange={set("sortOrder")} className={`${inputCls} font-mono`} inputMode="numeric" /></L>
        {kind === "achievements" && (
          <L t="Иконка" wide><div className="flex flex-wrap gap-1.5">{Object.keys(ACH_ICONS).map((k) => (
            <button key={k} type="button" onClick={() => setF((x) => ({ ...x, icon: k }))} aria-pressed={f.icon === k} className={`rounded-xl p-0.5 ring-2 ${f.icon === k ? "ring-accent" : "ring-transparent"}`}><AchIcon icon={k} done={f.icon === k} size={36} /></button>
          ))}</div></L>
        )}
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.enabled} onChange={set("enabled")} className="size-4 accent-[#3ee08f]" />Включено</label>
        {kind === "quests" && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.pinned} onChange={set("pinned")} className="size-4 accent-[#3ee08f]" />Каждый день (закреплено)</label>}
      </fieldset>
      {!readOnly && <div className="flex flex-wrap gap-2"><Button onClick={save} loading={act.busy}>{creating ? "Создать" : "Сохранить"}</Button>{onCancel && <Button variant="ghost" onClick={onCancel}>Отмена</Button>}{!creating && <Button variant="danger" onClick={del}>Удалить</Button>}</div>}
      <Msg m={act.msg} />
    </div>
  );
}

const L = ({ t, children, wide }: { t: string; children: React.ReactNode; wide?: boolean }) => <label className={`grid gap-1 ${wide ? "sm:col-span-2" : ""}`}><span className="text-[11.5px] font-medium uppercase tracking-wider text-muted">{t}</span>{children}</label>;
