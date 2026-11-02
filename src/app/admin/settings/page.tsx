"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel, unitsToInput, parsePoints } from "@/components/play/kit";
import { inputCls, Loading, Msg, useAction, useAdminData, useIsAdmin } from "@/components/admin/ui";
import { api } from "@/lib/api";

type S = { maintenance: boolean; registrationOpen: boolean; startGrant: number; dailyBonus: number; announcement: string };

export default function AdminSettings() {
  const admin = useIsAdmin();
  const { data, error, setData } = useAdminData<{ settings: S }>("/api/admin/settings");
  const act = useAction();
  const [f, setF] = useState<{ maintenance: boolean; registrationOpen: boolean; startGrant: string; dailyBonus: string; announcement: string } | null>(null);
  useEffect(() => { if (data) setF({ ...data.settings, startGrant: unitsToInput(BigInt(data.settings.startGrant)), dailyBonus: unitsToInput(BigInt(data.settings.dailyBonus)) }); }, [data]);
  if (!data || !f) return <Loading error={error} />;

  const sg = parsePoints(f.startGrant), db = parsePoints(f.dailyBonus);
  const save = () => act.run(() => api<{ settings: S }>("/api/admin/settings", { method: "PATCH", body: { maintenance: f.maintenance, registrationOpen: f.registrationOpen, startGrant: Number(sg), dailyBonus: Number(db), announcement: f.announcement.trim() } }), "Настройки сохранены").then((r) => r && setData(r));

  return (
    <Panel className="grid max-w-2xl gap-5 p-5">
      <fieldset disabled={!admin || act.busy} className="grid gap-4">
        <Toggle label="Технические работы" hint="Все ставки отклоняются, на сайте показывается предупреждение" on={f.maintenance} set={(v) => setF({ ...f, maintenance: v })} />
        <Toggle label="Регистрация открыта" hint="Если выключить, новые аккаунты создать нельзя" on={f.registrationOpen} set={(v) => setF({ ...f, registrationOpen: v })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1"><span className="text-[12px] font-medium uppercase tracking-wider text-muted">Стартовые демо-баллы</span><input value={f.startGrant} onChange={(e) => setF({ ...f, startGrant: e.target.value })} className={`${inputCls} font-mono`} inputMode="decimal" /></label>
          <label className="grid gap-1"><span className="text-[12px] font-medium uppercase tracking-wider text-muted">Ежедневный бонус (0 — выкл.)</span><input value={f.dailyBonus} onChange={(e) => setF({ ...f, dailyBonus: e.target.value })} className={`${inputCls} font-mono`} inputMode="decimal" /></label>
        </div>
        <label className="grid gap-1"><span className="text-[12px] font-medium uppercase tracking-wider text-muted">Объявление для всех (пусто — скрыто)</span><input value={f.announcement} onChange={(e) => setF({ ...f, announcement: e.target.value.slice(0, 200) })} className={inputCls} placeholder="Например: в субботу турнир по Crash" /></label>
      </fieldset>
      {admin ? <Button onClick={save} loading={act.busy} disabled={sg === null || db === null} className="w-fit">Сохранить</Button> : <p className="text-[13px] text-muted">Изменять настройки может только администратор.</p>}
      <Msg m={act.msg} />
    </Panel>
  );
}

function Toggle({ label, hint, on, set }: { label: string; hint: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="flex items-center justify-between gap-4 rounded-2xl bg-ink p-4 text-left disabled:opacity-60">
      <span><span className="block font-medium">{label}</span><span className="text-[13px] text-muted">{hint}</span></span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-raised"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} /></span>
    </button>
  );
}
