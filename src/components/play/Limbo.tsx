"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { limboChance } from "@/lib/fair/outcomes";
import { points } from "@/lib/format";
import { BetAmount, betError, ErrorLine, GameLayout, Label, newKey, parsePoints, PlayButton, RoundsPanel, Stat, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Res = { round: RoundView; balance: string };
const describe = (r: RoundView) => { const x = r.result as { value: number; target: number } | null; return x ? `Выпало ${x.value.toFixed(2)}× · цель ${x.target.toFixed(2)}×` : "—"; };

export function LimboGame({ cfg }: { cfg: GameConfig }) {
  const { balance, setBalance } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("10");
  const [target, setTarget] = useState("2");
  const [shown, setShown] = useState(1);
  const [last, setLast] = useState<{ value: number; win: boolean; id: string } | null>(null);
  const [rolling, setRolling] = useState(false);
  const [recent, setRecent] = useState<{ value: number; win: boolean; id: string }[]>([]);
  const [version, setVersion] = useState(0);
  const anim = useRef<ReturnType<typeof animate> | null>(null);
  useEffect(() => () => anim.current?.stop(), []);

  const t = Number(target.replace(",", "."));
  const tOk = Number.isFinite(t) && t >= 1.01 && t <= 1_000_000;
  const units = parsePoints(amount) ?? 0n;
  const profit = tOk ? (units * BigInt(Math.round(t * 100))) / 100n - units : 0n;

  async function play() {
    const r = await run<Res>("/api/games/limbo/bet", { amount, params: { target: Math.round(t * 100) / 100 }, key: newKey() }, { deferBalance: true });
    if (!r) return;
    const x = r.round.result as { value: number; win: boolean };
    setRolling(true); setLast(null);
    // Число «разгоняется» от 1.00 до результата, затем показываем итог
    anim.current = animate(1, x.value, {
      duration: Math.min(0.35 + Math.log10(x.value) * 0.35, 1.1), ease: [0.2, 0.7, 0.3, 1], onUpdate: setShown,
      onComplete: () => {
        setShown(x.value); setRolling(false); setBalance(r.balance);
        const item = { value: x.value, win: x.win, id: r.round.id };
        setLast(item); setRecent((p) => [item, ...p].slice(0, 12)); setVersion((v) => v + 1);
      },
    });
  }

  const controls = (
    <>
      <BetAmount value={amount} onChange={setAmount} cfg={cfg} disabled={busy || rolling} />
      <div>
        <Label>Цель, ×</Label>
        <input value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))} inputMode="decimal" disabled={busy || rolling} aria-label="Целевой множитель"
          className={`h-11 w-full rounded-xl border bg-ink px-3 font-mono text-[15px] tabular outline-none focus:border-accent ${tOk ? "border-line" : "border-danger/70"}`} />
        {!tOk && <p className="mt-1 text-[12px] text-danger">От 1,01 до 1 000 000</p>}
        <div className="mt-2 grid grid-cols-4 gap-1">{["1.5", "2", "5", "10"].map((v) => <button key={v} type="button" onClick={() => setTarget(v)} className="h-8 rounded-lg bg-raised text-[12.5px] font-semibold text-soft hover:text-white">{v}×</button>)}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Шанс" value={tOk ? `${limboChance(t, cfg.edgeBp).toFixed(4)}%` : "—"} />
        <Stat label="Прибыль" value={points(profit)} tone="accent" />
      </div>
      <ErrorLine text={error} />
      <PlayButton onClick={play} loading={busy || rolling} disabled={!cfg.enabled || !tOk || !!betError(amount, cfg, balance)}>{cfg.enabled ? "Играть" : "Игра отключена"}</PlayButton>
    </>
  );

  const color = last ? (last.win ? "text-accent" : "text-danger") : rolling ? "text-white" : "text-raised";
  const stage = (
    <div className="relative flex min-h-[360px] flex-col justify-between gap-6 overflow-hidden p-5 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_47px,rgb(255_255_255/0.025)_47px_48px),repeating-linear-gradient(0deg,transparent_0_47px,rgb(255_255_255/0.025)_47px_48px)]" />
      <div className="relative flex min-h-8 flex-wrap justify-end gap-1.5">
        <AnimatePresence initial={false}>
          {recent.map((r) => (
            <motion.span key={r.id} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
              className={`rounded-lg px-2 py-1 font-mono text-[12px] font-semibold tabular ${r.win ? "bg-accent/15 text-accent" : "bg-raised text-muted"}`}>{r.value.toFixed(2)}×</motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div className="relative grid place-items-center gap-3">
        <motion.p animate={last ? { scale: [1, 1.08, 1] } : {}} transition={{ duration: 0.35 }} className={`font-display text-[64px] font-bold tabular transition-colors sm:text-[96px] ${color}`} aria-live="polite">
          {shown.toFixed(2)}×
        </motion.p>
        <p className="text-[14px] text-soft">{last ? (last.win ? `Цель ${t.toFixed(2)}× достигнута` : `Не хватило до ${t.toFixed(2)}×`) : `Цель: ${tOk ? t.toFixed(2) : "—"}×`}</p>
      </div>
      <div />
    </div>
  );

  return <GameLayout slug="limbo" controls={controls} stage={stage} footer={<RoundsPanel slug="limbo" version={version} describe={describe} />} />;
}
