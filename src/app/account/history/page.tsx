"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { points, timeAgo } from "@/lib/format";
import { GAME_NAMES, isGameSlug } from "@/lib/games";

type Item = { id: string; type: string; amount: string; balanceAfter: string; note: string | null; createdAt: string; game: string | null; multiplier: string | null };
const TYPES: [string, string][] = [["ALL", "Все"], ["BET", "Ставки"], ["WIN", "Выигрыши"], ["DEMO_GRANT", "Бонусы"], ["REFUND", "Возвраты"], ["ADMIN_ADJUST", "Корректировки"]];
const LABEL: Record<string, string> = { BET: "Ставка", WIN: "Выигрыш", DEMO_GRANT: "Демо-рубли", REFUND: "Возврат", ADMIN_ADJUST: "Корректировка" };

export default function HistoryPage() {
  const [type, setType] = useState("ALL");
  const [items, setItems] = useState<Item[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState("");
  const load = useCallback(async (reset: boolean, cur: string | null) => {
    setLoading(true); setErr("");
    try {
      const r = await api<{ items: Item[]; nextCursor: string | null }>(`/api/account/ledger?type=${type}${!reset && cur ? `&cursor=${cur}` : ""}`);
      setItems((prev) => (reset ? r.items : [...prev, ...r.items])); setCursor(r.nextCursor);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [type]);
  useEffect(() => { void load(true, null); }, [load]);

  return (
    <section className="rounded-3xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <h1 className="font-display text-[20px] font-bold">История операций</h1>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Фильтр">
          {TYPES.map(([k, t]) => <button key={k} onClick={() => setType(k)} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${type === k ? "bg-accent text-accent-ink" : "bg-raised text-soft hover:text-white"}`}>{t}</button>)}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead><tr className="text-left text-[12px] uppercase tracking-wider text-muted">
            <th className="px-4 py-3 font-medium">Операция</th><th className="px-4 py-3 font-medium">Игра</th><th className="px-4 py-3 text-right font-medium">Сумма</th><th className="px-4 py-3 text-right font-medium">Баланс после</th><th className="px-4 py-3 text-right font-medium">Когда</th>
          </tr></thead>
          <tbody>
            {items.map((i) => {
              const amt = BigInt(i.amount);
              return (
                <tr key={i.id} className="border-t border-line/60">
                  <td className="px-4 py-3"><span className="font-medium">{LABEL[i.type] ?? i.type}</span>{i.note && <span className="block text-[12px] text-muted">{i.note}</span>}</td>
                  <td className="px-4 py-3 text-soft">{i.game && isGameSlug(i.game) ? GAME_NAMES[i.game] : "—"}{i.type === "WIN" && i.multiplier ? ` · ${Number(i.multiplier).toFixed(2)}×` : ""}</td>
                  <td className={`px-4 py-3 text-right font-mono tabular ${amt > 0n ? "text-accent" : "text-soft"}`}>{amt > 0n ? "+" : ""}{points(amt)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular text-soft">{points(i.balanceAfter)}</td>
                  <td className="px-4 py-3 text-right text-muted" title={new Date(i.createdAt).toLocaleString("ru-RU")}>{timeAgo(i.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && !items.length && !err && <p className="p-8 text-center text-muted">Операций пока нет.</p>}
      {err && <p className="p-4 text-danger">{err}</p>}
      <div className="p-4 text-center">{loading ? <span className="inline-block size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" /> : cursor && <Button variant="secondary" onClick={() => load(false, cursor)}>Показать ещё</Button>}</div>
    </section>
  );
}
