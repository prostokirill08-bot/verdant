"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { points, timeAgo } from "@/lib/format";
import { GAME_NAMES, GAME_SLUGS, isGameSlug } from "@/lib/games";

type Item = { id: string; type: string; amount: string; balanceAfter: string; note: string | null; createdAt: string; game: string | null; multiplier: string | null };
const TYPES: [string, string][] = [["ALL", "Все"], ["BET", "Ставки"], ["WIN", "Выигрыши"], ["DEPOSIT", "Пополнения"], ["DEMO_GRANT", "Бонусы"], ["REWARD", "Награды"], ["PROMO", "Призы"], ["REFUND", "Возвраты"], ["ADMIN_ADJUST", "Корректировки"]];
const LABEL: Record<string, string> = { REWARD: "Награда", BET: "Ставка", WIN: "Выигрыш", DEPOSIT: "Пополнение", PROMO: "Приз акции", DEMO_GRANT: "Демо-рубли", REFUND: "Возврат", ADMIN_ADJUST: "Корректировка" };

function LedgerHistory() {
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
        <h2 className="font-display text-[18px] font-bold">Изменения баланса</h2>
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
                  <td className="whitespace-nowrap px-4 py-3 text-right text-muted" title={timeAgo(i.createdAt)}>{new Date(i.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
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

type RoundItem = { id: string; gameSlug: string; betAmount: string; payout: string; multiplier: string; status: string; createdAt: string };

/** Игровые раунды: игра, ставка, выплата, множитель, результат и время; фильтр по игре и результату. */
function RoundsHistory() {
  const [game, setGame] = useState(""); const [result, setResult] = useState("");
  const [items, setItems] = useState<RoundItem[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState("");
  const load = useCallback(async (cur: string | null) => {
    setLoading(true); setErr("");
    try {
      const sp = new URLSearchParams(); if (game) sp.set("game", game); if (result) sp.set("result", result); if (cur) sp.set("cursor", cur);
      const r = await api<{ items: RoundItem[]; nextCursor: string | null }>(`/api/account/rounds?${sp}`);
      setItems((prev) => (cur ? [...prev, ...r.items] : r.items)); setCursor(r.nextCursor);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [game, result]);
  useEffect(() => { void load(null); }, [load]);
  const sel = "h-9 rounded-lg border border-line bg-ink px-2 text-[13px] outline-none focus:border-accent";
  return (
    <section className="rounded-3xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <h2 className="font-display text-[18px] font-bold">Игровые раунды</h2>
        <div className="flex flex-wrap gap-2">
          <select value={game} onChange={(e) => setGame(e.target.value)} className={sel} aria-label="Игра">
            <option value="">Все игры</option>{GAME_SLUGS.map((g) => <option key={g} value={g}>{GAME_NAMES[g]}</option>)}
          </select>
          <select value={result} onChange={(e) => setResult(e.target.value)} className={sel} aria-label="Результат">
            <option value="">Любой результат</option><option value="won">Выигрыш</option><option value="lost">Проигрыш</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[14px]" data-testid="rounds-table">
          <thead><tr className="text-left text-[12px] uppercase tracking-wider text-muted">
            <th className="px-4 py-3 font-medium">Игра</th><th className="px-4 py-3 font-medium">Результат</th><th className="px-4 py-3 text-right font-medium">Ставка</th><th className="px-4 py-3 text-right font-medium">Выплата</th><th className="px-4 py-3 text-right font-medium">Время</th>
          </tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t border-line/60">
                <td className="px-4 py-3"><Link href={`/games/${r.gameSlug}`} className="font-medium hover:text-accent">{isGameSlug(r.gameSlug) ? GAME_NAMES[r.gameSlug] : r.gameSlug}</Link></td>
                <td className="px-4 py-3">{r.status === "WON" ? <span className="text-accent">Выигрыш · {Number(r.multiplier).toFixed(2)}×</span> : r.status === "LOST" ? <span className="text-muted">Проигрыш</span> : <span className="text-muted">Отменён</span>}</td>
                <td className="px-4 py-3 text-right font-mono tabular text-soft">{points(r.betAmount)}</td>
                <td className={`px-4 py-3 text-right font-mono tabular ${BigInt(r.payout) > 0n ? "text-accent" : "text-muted"}`}>{points(r.payout)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-muted">{new Date(r.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !items.length && !err && <p className="p-8 text-center text-muted">Раундов пока нет.</p>}
      {err && <p className="p-4 text-danger">{err}</p>}
      <div className="p-4 text-center">{loading ? <span className="inline-block size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" /> : cursor && <Button variant="secondary" onClick={() => load(cursor)}>Показать ещё</Button>}</div>
    </section>
  );
}

function HistoryTabs() {
  const sp = useSearchParams(); const router = useRouter();
  const tab = sp.get("tab") === "rounds" ? "rounds" : "ledger";
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[24px] font-bold">История</h1>
        <div className="flex gap-1 rounded-xl bg-panel p-1 ring-1 ring-line" role="tablist">
          {([["ledger", "Операции"], ["rounds", "Раунды"]] as const).map(([k, t]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => router.replace(k === "rounds" ? "/account/history?tab=rounds" : "/account/history", { scroll: false })}
              className={`rounded-lg px-4 py-1.5 text-[13.5px] font-semibold ${tab === k ? "bg-accent text-accent-ink" : "text-soft hover:text-white"}`}>{t}</button>
          ))}
        </div>
      </div>
      {tab === "rounds" ? <RoundsHistory /> : <LedgerHistory />}
      <p className="text-[12.5px] text-muted">Вся история формируется на сервере из журнала операций и раундов. Время — по часовому поясу устройства.</p>
    </div>
  );
}

export default function HistoryPage() {
  return <Suspense fallback={<div className="h-60 animate-pulse rounded-3xl bg-panel" />}><HistoryTabs /></Suspense>;
}
