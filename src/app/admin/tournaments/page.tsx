"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, inputCls, Loading, Msg, useAction, useAdminData, useIsAdmin } from "@/components/admin/ui";
import { LeaderRows, type LbRow } from "@/components/leaderboard/Rows";
import { api } from "@/lib/api";
import { points } from "@/lib/format";

type S = { enabled: boolean; title: string; minBet: number; prizes: number[] };
type D = { settings: S; current: { week: string; title: string; prizes: string[]; top: LbRow[]; endsAt: string }; history: { id: string; title: string; startsAt: string; participants: number; top: LbRow[] }[] };

/** Турниры: настройки (только демо-кредиты), текущая таблица, история и ручное подведение итогов. */
export default function AdminTournaments() {
  const { data, error, reload } = useAdminData<D>("/api/admin/tournaments");
  const admin = useIsAdmin(); const act = useAction();
  const [f, setF] = useState<{ enabled: boolean; title: string; minBet: string; prizes: string } | null>(null);
  useEffect(() => { if (data) setF({ enabled: data.settings.enabled, title: data.settings.title, minBet: String(data.settings.minBet / 100), prizes: data.settings.prizes.map((p) => p / 100).join(", ") }); }, [data]);
  if (!data || !f) return <Loading error={error} />;
  const save = () => {
    const prizes = f.prizes.split(/[,;\s]+/).filter(Boolean).map((x) => Math.round(Number(x.replace(",", ".")) * 100));
    if (prizes.some((x) => !Number.isFinite(x) || x < 0)) return act.setMsg({ ok: false, text: "Призы — числа через запятую" });
    return act.run(() => api("/api/admin/tournaments", { method: "PUT", body: { enabled: f.enabled, title: f.title, minBet: Math.round(Number(f.minBet.replace(",", ".")) * 100), prizes } }), "Сохранено. Новые призы действуют со следующей недели.").then((r) => r && reload());
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <section className="grid content-start gap-3 rounded-2xl border border-line bg-panel p-4">
        <p className="font-semibold">Настройки турнира недели</p>
        <fieldset disabled={!admin || act.busy} className="grid gap-2">
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} className="size-4 accent-[#3ee08f]" />Турнир включён</label>
          <label className="grid gap-1"><span className="text-[11.5px] uppercase tracking-wider text-muted">Название</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} maxLength={60} /></label>
          <label className="grid gap-1"><span className="text-[11.5px] uppercase tracking-wider text-muted">Минимальная ставка, DC</span><input value={f.minBet} onChange={(e) => setF({ ...f, minBet: e.target.value })} className={`${inputCls} font-mono`} inputMode="decimal" /></label>
          <label className="grid gap-1"><span className="text-[11.5px] uppercase tracking-wider text-muted">Призы по местам, DC (через запятую)</span><textarea value={f.prizes} onChange={(e) => setF({ ...f, prizes: e.target.value })} rows={3} className={`${inputCls} h-auto py-2 font-mono`} /></label>
        </fieldset>
        <p className="text-[12.5px] text-muted">Только виртуальные демо-кредиты — денежных призов нет. Итоги подводятся автоматически в понедельник 00:00 МСК (фоновая задача раз в 15 минут).</p>
        {admin && <div className="flex flex-wrap gap-2"><Button onClick={save} loading={act.busy}>Сохранить</Button><Button variant="secondary" loading={act.busy} onClick={() => act.run(() => api<{ paid: number }>("/api/admin/tournaments/finalize", { method: "POST" }), "Итоги прошлой недели проверены").then((r) => r && reload())}>Подвести итоги прошлой недели</Button></div>}
        <Msg m={act.msg} />
      </section>
      <section className="rounded-2xl border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between"><p className="font-semibold">{data.current.title} · {data.current.week}</p><Badge tone="accent">идёт</Badge></div>
        <LeaderRows rows={data.current.top.slice(0, 20).map((r) => ({ ...r, prize: (r as { prize?: string }).prize }))} unit="mult" empty="Пока нет участников." />
      </section>
      <section className="rounded-2xl border border-line bg-panel p-4 lg:col-span-2">
        <p className="mb-3 font-semibold">История турниров</p>
        {data.history.length ? <ul className="grid gap-2">{data.history.map((h) => (
          <li key={h.id}><Link href={`/leaderboard/${h.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink/60 px-3 py-2 ring-1 ring-line hover:ring-accent/40">
            <span className="font-semibold">{h.title} · {h.id}</span><span className="text-[13px] text-muted">{h.participants} в таблице · {h.top.map((r) => `${r.place}. ${r.user}`).join(", ") || "без участников"}</span>
          </Link></li>
        ))}</ul> : <p className="text-[13.5px] text-muted">Завершённых турниров пока нет.</p>}
        <p className="mt-3 text-[12px] text-muted">Призы текущей недели: {data.current.prizes.map((p, i) => `${i + 1}: ${points(p)}`).join(" · ")}</p>
      </section>
    </div>
  );
}
