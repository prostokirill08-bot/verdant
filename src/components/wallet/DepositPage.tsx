"use client";
import { sfx } from "@/lib/sound";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api";
import { points, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/telegram";
import { newKey, parsePoints } from "@/components/play/kit";

type Info = { min: string; max: string; dayLimit: string; dayUsed: string; items: { id: string; amount: string; method: string; createdAt: string }[] };
type Method = "card" | "sbp" | "wallet";
const METHODS: { id: Method; name: string; note: string; icon: React.ReactNode }[] = [
  { id: "sbp", name: "СБП", note: "мгновенно", icon: <svg viewBox="0 0 24 24" className="size-6" aria-hidden><path fill="#5b8cff" d="M4 3l4 7v11l-4-7z" /><path fill="#ff6b8b" d="M8 10l12-7-4 7z" /><path fill="#ffd166" d="M8 10h8l-8 5z" /><path fill="#3ee08f" d="M8 15l12 6H8z" /></svg> },
  { id: "card", name: "Карта", note: "любой банк", icon: <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6 15h4" /></svg> },
  { id: "wallet", name: "Кошелёк", note: "электронный", icon: <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z" /><path d="M4 7l11-3v3M16 13.5h2" /></svg> },
];
const PRESETS = [300, 1000, 3000, 10_000, 50_000, 300_000];
const NAME: Record<string, string> = { card: "Карта", sbp: "СБП", wallet: "Кошелёк" };
const rub = (n: number) => n.toLocaleString("ru-RU");

/** Демо-касса: выбор суммы и способа, «обработка», успешное зачисление. Реальные деньги не участвуют. */
export function DepositPage() {
  const { user, loading, balance, setBalance } = useAuth();
  const [info, setInfo] = useState<Info | null>(null);
  const [amount, setAmount] = useState("1000");
  const [method, setMethod] = useState<Method>("sbp");
  const [step, setStep] = useState<"form" | "processing" | "done">("form");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ amount: string; balance: string } | null>(null);
  const [key, setKey] = useState(newKey);

  const load = useCallback(() => api<Info>("/api/account/deposit").then(setInfo).catch(() => {}), []);
  useEffect(() => { if (user) void load(); }, [user, load]);

  const units = parsePoints(amount);
  const min = BigInt(info?.min ?? 30000), max = BigInt(info?.max ?? 30000000);
  const left = info ? BigInt(info.dayLimit) - BigInt(info.dayUsed) : max;
  const err = units === null ? "Введи сумму" : units < min ? `Минимум ${points(min)}` : units > max ? `Максимум ${points(max)} за раз` : units > left ? `Сегодня можно ещё ${points(left > 0n ? left : 0n)}` : "";

  async function pay() {
    if (err || units === null) return;
    setError(""); setStep("processing"); haptic("tap");
    const started = Date.now();
    try {
      const r = await api<{ balance: string; deposit: { amount: string } }>("/api/account/deposit", { body: { amount: amount.replace(",", "."), method, key } });
      await new Promise((ok) => setTimeout(ok, Math.max(0, 1400 - (Date.now() - started))));   // «банк обрабатывает»
      setBalance(r.balance); setDone({ amount: r.deposit.amount, balance: r.balance }); setStep("done"); haptic("win"); sfx("cashout"); sfx("coins", { delay: 200 });
      setKey(newKey()); void load();
    } catch (e) {
      setStep("form"); setError(e instanceof ApiError ? e.message : "Не удалось пополнить, попробуй ещё раз"); haptic("lose");
    }
  }

  if (!loading && !user) return (
    <div className="mx-auto grid max-w-md gap-4 rounded-[24px] border border-line bg-panel p-6 text-center">
      <p className="text-[40px]" aria-hidden>💳</p>
      <h1 className="font-display text-[24px] font-bold">Пополнение баланса</h1>
      <p className="text-muted">Войди или зарегистрируйся, чтобы пополнить баланс и начать играть.</p>
      <div className="grid grid-cols-2 gap-2"><Link href="/login?next=/deposit"><Button variant="secondary" className="w-full">Войти</Button></Link><Link href="/register"><Button className="w-full">Регистрация</Button></Link></div>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-[980px] gap-5 lg:grid-cols-[1fr_340px]">
      <section className="relative overflow-hidden rounded-[24px] border border-line bg-panel p-5 sm:p-7" data-testid="deposit-form">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-[24px] font-bold sm:text-[28px]">Пополнение</h1>
          <span className="rounded-lg bg-gold/15 px-2.5 py-1 text-[12px] font-semibold text-gold">Демо-касса · без списания денег</span>
        </div>
        <p className="mt-1 text-[14px] text-muted">Баланс: <span className="font-mono font-semibold text-white">{points(balance)}</span></p>

        <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Способ</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {METHODS.map((m) => (
            <button key={m.id} type="button" onClick={() => { setMethod(m.id); haptic("select"); }} aria-pressed={method === m.id}
              className={`grid justify-items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center transition-colors ${method === m.id ? "border-accent bg-accent/10" : "border-line bg-ink hover:border-line/80 hover:bg-raised/50"}`}>
              {m.icon}<span className="text-[14px] font-semibold">{m.name}</span><span className="text-[11.5px] text-muted">{m.note}</span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Сумма</p>
        <div className="mt-2 flex h-16 items-center rounded-2xl border-2 border-line bg-ink px-4 focus-within:border-accent">
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))} inputMode="decimal" aria-label="Сумма пополнения" data-testid="deposit-amount"
            className="min-w-0 flex-1 bg-transparent font-mono text-[28px] font-semibold outline-none" />
          <span className="text-[24px] font-semibold text-muted">₽</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => { setAmount(String(p)); haptic("select"); }}
              className={`h-10 rounded-xl text-[13.5px] font-semibold transition-colors ${units === BigInt(p * 100) ? "bg-accent text-accent-ink" : "bg-raised text-soft hover:text-white"}`}>{rub(p)} ₽</button>
          ))}
        </div>
        <p className={`mt-2 min-h-5 text-[13px] ${err && amount ? "text-danger" : "text-muted"}`}>{err && amount ? err : "От 300 до 300 000 ₽ за раз, до 1 000 000 ₽ в сутки"}</p>

        <AnimatePresence>{error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-[13.5px] text-danger" role="alert">{error}</motion.p>}</AnimatePresence>

        <Button size="lg" className="btn-shine mt-4 w-full" onClick={pay} disabled={!!err || step !== "form"} loading={step === "processing"} data-testid="deposit-pay">
          {units !== null && !err ? `Пополнить на ${points(units)}` : "Пополнить"}
        </Button>
        <p className="mt-3 text-center text-[12px] leading-relaxed text-muted">Это демо-касса проекта: деньги не списываются, данные карты не нужны. Начисляются демо-рубли — вывести их нельзя.</p>

        {/* Обработка и успех поверх формы */}
        <AnimatePresence>
          {step !== "form" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-panel/95 p-6 text-center backdrop-blur" data-testid="deposit-overlay">
              {step === "processing" ? (
                <div className="grid justify-items-center gap-4">
                  <span className="size-14 animate-spin rounded-full border-4 border-accent/25 border-t-accent" aria-hidden />
                  <p className="font-display text-[20px] font-bold">Проводим платёж…</p>
                  <p className="text-muted">{NAME[method]} · {units !== null && points(units)}</p>
                </div>
              ) : done && (
                <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 14 }} className="grid justify-items-center gap-3">
                  <span className="grid size-20 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_0_60px_-10px_#3ee08f]">
                    <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                  </span>
                  <p className="font-display text-[24px] font-bold" data-testid="deposit-done">+{points(done.amount)}</p>
                  <p className="text-muted">Баланс пополнен. Сейчас на счёте <span className="font-mono text-white">{points(done.balance)}</span></p>
                  <div className="mt-2 grid w-full max-w-xs grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setStep("form")}>Ещё раз</Button>
                    <Link href="/games"><Button className="w-full">К играм</Button></Link>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <aside className="grid content-start gap-4">
        <div className="rounded-[24px] border border-line bg-panel p-5">
          <p className="font-semibold">Лимиты</p>
          <dl className="mt-3 grid gap-2 text-[14px]">
            <div className="flex justify-between"><dt className="text-muted">За раз</dt><dd>300 – 300 000 ₽</dd></div>
            <div className="flex justify-between"><dt className="text-muted">В сутки</dt><dd>до 1 000 000 ₽</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Осталось сегодня</dt><dd className="font-mono">{info ? points(left > 0n ? left : 0n) : "…"}</dd></div>
          </dl>
          {info && <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Number((BigInt(info.dayUsed) * 100n) / BigInt(info.dayLimit)))}%` }} /></div>}
        </div>
        <div className="rounded-[24px] border border-line bg-panel p-5">
          <p className="font-semibold">История пополнений</p>
          <ul className="mt-3 grid gap-2" data-testid="deposit-history">
            {info?.items.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-xl bg-ink px-3 py-2 text-[14px]">
                <span><span className="block">{NAME[d.method] ?? d.method}</span><span className="text-[12px] text-muted">{timeAgo(d.createdAt)}</span></span>
                <span className="font-mono font-semibold text-accent">+{points(d.amount)}</span>
              </li>
            ))}
            {info && !info.items.length && <li className="text-[14px] text-muted">Пока пусто — первое пополнение от 300 ₽.</li>}
          </ul>
          <Link href="/account/history" className="mt-3 inline-block text-[13.5px] text-accent hover:underline">Все операции →</Link>
        </div>
      </aside>
    </div>
  );
}
