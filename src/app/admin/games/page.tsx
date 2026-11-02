"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel, unitsToInput } from "@/components/play/kit";
import { Badge, inputCls, Loading, Msg, useAction, useAdminData, useIsAdmin } from "@/components/admin/ui";
import { GameIcon } from "@/components/games/GameIcon";
import { api } from "@/lib/api";
import { points } from "@/lib/format";
import { isGameSlug } from "@/lib/games";

type G = { slug: string; title: string; tagline: string; enabled: boolean; minBet: string; maxBet: string; houseEdgeBp: number; sortOrder: number; rounds: number; wagered: string; payout: string };

export default function AdminGames() {
  const { data, error, reload } = useAdminData<{ games: G[] }>("/api/admin/games");
  if (!data) return <Loading error={error} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {data.games.map((g) => <GameCard key={g.slug} g={g} onSaved={reload} />)}
      <p className="text-[12.5px] text-muted lg:col-span-2">Преимущество платформы влияет на Dice, Limbo, Mines и Crash и сохраняется в каждом раунде (для проверки честности). У Plinko и Roulette собственные таблицы выплат.</p>
    </div>
  );
}

function GameCard({ g, onSaved }: { g: G; onSaved: () => void }) {
  const admin = useIsAdmin();
  const act = useAction();
  const [f, setF] = useState({ title: g.title, tagline: g.tagline, minBet: unitsToInput(BigInt(g.minBet)), maxBet: unitsToInput(BigInt(g.maxBet)), edge: (g.houseEdgeBp / 100).toString(), sortOrder: String(g.sortOrder) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = (patch: Record<string, unknown>, ok: string) => act.run(() => api(`/api/admin/games/${g.slug}`, { method: "PATCH", body: patch }), ok).then((r) => r && onSaved());
  const submit = () => save({ title: f.title, tagline: f.tagline, minBet: f.minBet, maxBet: f.maxBet, houseEdgeBp: Math.round(Number(f.edge.replace(",", ".")) * 100), sortOrder: Number(f.sortOrder) }, "Сохранено");

  return (
    <Panel className="grid gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-ink text-accent">{isGameSlug(g.slug) && <GameIcon slug={g.slug} />}</span>
        <div className="min-w-0 flex-1"><p className="font-semibold">{g.title}</p><p className="text-[12.5px] text-muted">{g.rounds} раундов · ставки {points(g.wagered)} · выплаты {points(g.payout)}</p></div>
        <Badge tone={g.enabled ? "accent" : "danger"}>{g.enabled ? "Включена" : "Выключена"}</Badge>
      </div>
      <fieldset disabled={!admin || act.busy} className="grid gap-2 sm:grid-cols-2">
        <L t="Название"><input value={f.title} onChange={set("title")} className={inputCls} maxLength={40} /></L>
        <L t="Порядок в каталоге"><input value={f.sortOrder} onChange={set("sortOrder")} className={inputCls} inputMode="numeric" /></L>
        <L t="Описание" wide><input value={f.tagline} onChange={set("tagline")} className={inputCls} maxLength={120} /></L>
        <L t="Мин. ставка"><input value={f.minBet} onChange={set("minBet")} className={`${inputCls} font-mono`} inputMode="decimal" /></L>
        <L t="Макс. ставка"><input value={f.maxBet} onChange={set("maxBet")} className={`${inputCls} font-mono`} inputMode="decimal" /></L>
        <L t="Преимущество, %"><input value={f.edge} onChange={set("edge")} className={`${inputCls} font-mono`} inputMode="decimal" /></L>
      </fieldset>
      {admin ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={submit} loading={act.busy}>Сохранить</Button>
          <Button variant={g.enabled ? "danger" : "secondary"} onClick={() => save({ enabled: !g.enabled }, g.enabled ? "Игра выключена" : "Игра включена")} loading={act.busy}>{g.enabled ? "Выключить" : "Включить"}</Button>
        </div>
      ) : <p className="text-[12.5px] text-muted">Изменять игры может только администратор.</p>}
      <Msg m={act.msg} />
    </Panel>
  );
}
const L = ({ t, children, wide }: { t: string; children: React.ReactNode; wide?: boolean }) => <label className={`grid gap-1 ${wide ? "sm:col-span-2" : ""}`}><span className="text-[11.5px] font-medium uppercase tracking-wider text-muted">{t}</span>{children}</label>;
