"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { inputCls, Loading, tdCls, thCls } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api";
import { points } from "@/lib/format";

type E = { id: string; type: string; amount: string; balanceAfter: string; note: string | null; createdAt: string; user: { id: string; username: string; publicId: string } };
const TYPES: [string, string][] = [["ALL", "Все"], ["BET", "Ставки"], ["WIN", "Выигрыши"], ["REWARD", "Награды"], ["PROMO", "Призы акций"], ["DEMO_GRANT", "Демо-бонусы"], ["DEPOSIT", "Демо-кредиты"], ["REFUND", "Возвраты"], ["ADMIN_ADJUST", "Корректировки"]];

/** История операций всех кошельков (только администратор). */
export default function AdminLedger() {
  const [type, setType] = useState("ALL"); const [q, setQ] = useState(""); const [query, setQuery] = useState("");
  const [items, setItems] = useState<E[] | null>(null); const [cursor, setCursor] = useState<string | null>(null); const [err, setErr] = useState("");
  const load = async (cur: string | null) => {
    try {
      const sp = new URLSearchParams({ type }); if (query) sp.set("q", query); if (cur) sp.set("cursor", cur);
      const r = await api<{ items: E[]; nextCursor: string | null }>(`/api/admin/ledger?${sp}`);
      setItems((p) => (cur ? [...(p ?? []), ...r.items] : r.items)); setCursor(r.nextCursor); setErr("");
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Ошибка"); }
  };
  useEffect(() => { setItems(null); void load(null); }, [type, query]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="rounded-2xl border border-line bg-panel">
      <div className="grid gap-3 border-b border-line p-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ник или ID игрока" className={inputCls} />
          <Button type="submit" variant="secondary">Найти</Button>
        </form>
        <div className="flex flex-wrap gap-1.5">{TYPES.map(([k, t]) => <button key={k} onClick={() => setType(k)} className={`rounded-lg px-3 py-1.5 text-[13px] ${type === k ? "bg-accent text-accent-ink" : "bg-raised text-soft"}`}>{t}</button>)}</div>
      </div>
      {!items ? <Loading error={err} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead><tr><th className={thCls}>Время</th><th className={thCls}>Игрок</th><th className={thCls}>Операция</th><th className={`${thCls} text-right`}>Сумма</th><th className={`${thCls} text-right`}>Баланс после</th></tr></thead>
            <tbody>{items.map((e) => (
              <tr key={e.id} className="border-t border-line/60">
                <td className={`${tdCls} whitespace-nowrap text-muted`}>{new Date(e.createdAt).toLocaleString("ru-RU")}</td>
                <td className={tdCls}><Link href={`/admin/users/${e.user.id}`} className="hover:text-accent">{e.user.username}</Link> <span className="font-mono text-[11.5px] text-muted">{e.user.publicId}</span></td>
                <td className={tdCls}>{TYPES.find(([k]) => k === e.type)?.[1] ?? e.type}{e.note && <span className="block text-[12px] text-muted">{e.note}</span>}</td>
                <td className={`${tdCls} text-right font-mono ${BigInt(e.amount) > 0n ? "text-accent" : "text-soft"}`}>{BigInt(e.amount) > 0n ? "+" : ""}{points(e.amount)}</td>
                <td className={`${tdCls} text-right font-mono text-muted`}>{points(e.balanceAfter)}</td>
              </tr>
            ))}</tbody>
          </table>
          {!items.length && <p className="p-6 text-center text-muted">Операций не найдено.</p>}
          {cursor && <div className="p-4 text-center"><Button variant="secondary" onClick={() => load(cursor)}>Показать ещё</Button></div>}
        </div>
      )}
    </section>
  );
}
