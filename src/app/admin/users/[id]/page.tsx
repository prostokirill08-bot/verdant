"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { newKey, Panel, Segmented, Stat } from "@/components/play/kit";
import { inputCls, Loading, Msg, roleBadge, statusBadge, tdCls, thCls, useAction, useAdminData, useIsAdmin } from "@/components/admin/ui";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import { points, timeAgo } from "@/lib/format";
import { GAME_NAMES, isGameSlug } from "@/lib/games";

type Detail = {
  user: { id: string; publicId: string; email: string; username: string; role: "USER" | "SUPPORT" | "ADMIN"; status: "ACTIVE" | "BLOCKED"; avatar: string; createdAt: string; lastLoginAt: string | null; lockedUntil: string | null };
  wallet: { balance: string; ledger: string; ok: boolean } | null;
  stats: { rounds: number; wagered: string; payout: string };
  ledger: { id: string; type: string; amount: string; balanceAfter: string; note: string | null; createdAt: string }[];
  rounds: { id: string; gameSlug: string; status: string; betAmount: string; payout: string; multiplier: number; createdAt: string }[];
  sessions: { id: string; ip: string | null; userAgent: string | null; createdAt: string }[];
  events: { id: string; action: string; ip: string | null; createdAt: string; meta: unknown }[];
};
const LEDGER: Record<string, string> = { BET: "Ставка", WIN: "Выигрыш", DEPOSIT: "Пополнение", PROMO: "Приз акции", DEMO_GRANT: "Демо-рубли", REFUND: "Возврат", ADMIN_ADJUST: "Корректировка" };
const RANK = { USER: 0, SUPPORT: 1, ADMIN: 2 } as const;

export default function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user: me } = useAuth();
  const isAdmin = useIsAdmin();
  const { data, error, reload } = useAdminData<Detail>(`/api/admin/users/${id}`);
  const act = useAction();
  const [reason, setReason] = useState("");
  const [dir, setDir] = useState<"credit" | "debit">("credit"); const [amount, setAmount] = useState(""); const [adjReason, setAdjReason] = useState("");

  if (!data) return <Loading error={error} />;
  const u = data.user;
  const canManage = !!me && me.publicId !== u.publicId && RANK[me.role] > RANK[u.role];

  const block = () => act.run(() => api(`/api/admin/users/${id}/status`, { body: { status: u.status === "BLOCKED" ? "ACTIVE" : "BLOCKED", reason } }), u.status === "BLOCKED" ? "Пользователь разблокирован" : "Пользователь заблокирован, сессии завершены").then((r) => { if (r) { setReason(""); void reload(); } });
  const role = (r: "USER" | "SUPPORT") => act.run(() => api(`/api/admin/users/${id}/role`, { body: { role: r } }), "Роль изменена").then((x) => x && reload());
  const adjust = () => act.run(() => api(`/api/admin/users/${id}/balance`, { body: { direction: dir, amount, reason: adjReason, key: newKey() } }), "Баланс скорректирован").then((r) => { if (r) { setAmount(""); setAdjReason(""); void reload(); } });
  const kill = () => act.run(() => api(`/api/admin/users/${id}/sessions`, { method: "DELETE" }), "Все сессии пользователя завершены").then((x) => x && reload());

  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <Link href="/admin/users" className="text-[14px] text-muted hover:text-white">← Все пользователи</Link>
      <Panel className="flex flex-wrap items-center gap-4 p-5">
        <Avatar name={u.username} avatar={u.avatar} size={56} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[20px] font-bold">{u.username}</p>
          <p className="truncate text-[14px] text-muted">{u.email} · <span className="font-mono">{u.publicId}</span></p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">{roleBadge(u.role)}{statusBadge(u.status)}{u.lockedUntil && new Date(u.lockedUntil) > new Date() && <span className="text-[12px] text-warn">вход заблокирован после неудачных попыток</span>}</div>
        </div>
        <div className="text-right text-[13px] text-muted"><p>Регистрация: {new Date(u.createdAt).toLocaleDateString("ru-RU")}</p><p>Последний вход: {u.lastLoginAt ? timeAgo(u.lastLoginAt) : "—"}</p></div>
      </Panel>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Баланс" value={points(data.wallet?.balance ?? "0")} />
        <Stat label="Сверка с журналом" value={data.wallet?.ok ? "совпадает" : "РАСХОЖДЕНИЕ"} tone={data.wallet?.ok ? "accent" : "danger"} />
        <Stat label="Раундов / поставлено" value={`${data.stats.rounds} / ${points(data.stats.wagered)}`} />
        <Stat label="Выплачено" value={points(data.stats.payout)} />
      </div>

      {canManage ? (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Panel className="grid content-start gap-3 p-4">
            <h2 className="font-semibold">Доступ</h2>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина (видна в журнале)" className={inputCls} maxLength={200} />
            <div className="flex flex-wrap gap-2">
              <Button variant={u.status === "BLOCKED" ? "primary" : "danger"} onClick={block} loading={act.busy} disabled={reason.trim().length < 3}>{u.status === "BLOCKED" ? "Разблокировать" : "Заблокировать"}</Button>
              <Button variant="secondary" onClick={kill} loading={act.busy} disabled={!data.sessions.length}>Завершить сессии ({data.sessions.length})</Button>
            </div>
            {isAdmin && (
              <div className="grid gap-1.5 border-t border-line pt-3">
                <p className="text-[12px] font-medium uppercase tracking-wider text-muted">Роль</p>
                <Segmented value={u.role as "USER" | "SUPPORT"} onChange={role} disabled={act.busy} options={[["USER", "Игрок"], ["SUPPORT", "Поддержка"]]} />
              </div>
            )}
          </Panel>
          {isAdmin && (
            <Panel className="grid content-start gap-3 p-4">
              <h2 className="font-semibold">Корректировка баланса</h2>
              <Segmented value={dir} onChange={setDir} options={[["credit", "Начислить"], ["debit", "Списать"]]} />
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))} placeholder="Сумма в рублях" inputMode="decimal" className={`${inputCls} font-mono`} />
              <input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Причина (обязательно)" className={inputCls} maxLength={200} />
              <Button onClick={adjust} loading={act.busy} disabled={!amount || adjReason.trim().length < 3}>Провести</Button>
              <p className="text-[12px] text-muted">Операция попадает в журнал баланса как «Корректировка» и в журнал действий админа.</p>
            </Panel>
          )}
        </div>
      ) : <p className="rounded-2xl border border-line bg-panel p-4 text-[14px] text-muted">{me?.publicId === u.publicId ? "Это твой аккаунт — управлять им через админ-панель нельзя." : "Недостаточно прав для управления этим пользователем."}</p>}
      <Msg m={act.msg} />

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <Panel>
          <h2 className="border-b border-line p-4 font-semibold">Журнал баланса</h2>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[460px] text-[13.5px]">
              <thead><tr><th className={thCls}>Операция</th><th className={`${thCls} text-right`}>Сумма</th><th className={`${thCls} text-right`}>После</th><th className={`${thCls} text-right`}>Когда</th></tr></thead>
              <tbody>{data.ledger.map((l) => (
                <tr key={l.id} className="border-t border-line/60">
                  <td className={tdCls}>{LEDGER[l.type] ?? l.type}{l.note && <span className="block text-[12px] text-muted">{l.note}</span>}</td>
                  <td className={`${tdCls} text-right font-mono ${BigInt(l.amount) > 0n ? "text-accent" : ""}`}>{points(l.amount)}</td>
                  <td className={`${tdCls} text-right font-mono text-soft`}>{points(l.balanceAfter)}</td>
                  <td className={`${tdCls} text-right text-muted`}>{timeAgo(l.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
        <Panel>
          <h2 className="border-b border-line p-4 font-semibold">Последние раунды</h2>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[460px] text-[13.5px]">
              <thead><tr><th className={thCls}>Игра</th><th className={`${thCls} text-right`}>Ставка</th><th className={`${thCls} text-right`}>×</th><th className={`${thCls} text-right`}>Выплата</th></tr></thead>
              <tbody>{data.rounds.map((r) => (
                <tr key={r.id} className="border-t border-line/60">
                  <td className={tdCls}>{isGameSlug(r.gameSlug) ? GAME_NAMES[r.gameSlug] : r.gameSlug} <span className="text-[12px] text-muted">{timeAgo(r.createdAt)}</span></td>
                  <td className={`${tdCls} text-right font-mono`}>{points(r.betAmount)}</td>
                  <td className={`${tdCls} text-right font-mono`}>{r.multiplier.toFixed(2)}</td>
                  <td className={`${tdCls} text-right font-mono ${BigInt(r.payout) > 0n ? "text-accent" : "text-muted"}`}>{points(r.payout)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
      </div>
      <Panel>
        <h2 className="border-b border-line p-4 font-semibold">События аккаунта</h2>
        <ul className="divide-y divide-line/60 text-[13.5px]">
          {data.events.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2 px-4 py-2"><span className="font-mono">{e.action}</span><span className="text-muted">{e.ip ?? ""} · {new Date(e.createdAt).toLocaleString("ru-RU")}</span></li>)}
          {!data.events.length && <li className="p-4 text-center text-muted">Событий нет</li>}
        </ul>
      </Panel>
    </div>
  );
}
