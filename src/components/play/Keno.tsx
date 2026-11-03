"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { KENO_PAYS, KENO_TOTAL } from "@/lib/fair/extra";
import { points } from "@/lib/format";
import { BetAmount, betError, ErrorLine, GameLayout, Label, newKey, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Res = { round: RoundView; balance: string };
const describe = (r: RoundView) => { const x = r.result as { picks: number[]; hits: number[] } | null; return x ? `Выбрано ${x.picks.length}, совпало ${x.hits.length}` : "—"; };

export function KenoGame({ cfg }: { cfg: GameConfig }) {
  const { balance, setBalance } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("10");
  const [picks, setPicks] = useState<number[]>([3, 11, 17, 24, 32]);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [revealing, setRevealing] = useState(false);
  const [result, setResult] = useState<{ hits: number; m: number; payout: string } | null>(null);
  const [version, setVersion] = useState(0);
  const pays = KENO_PAYS[picks.length] ?? [];
  const locked = busy || revealing;

  const toggle = (n: number) => { if (locked) return; setResult(null); setDrawn([]); setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= 10 ? p : [...p, n])); };
  const random = () => { if (locked) return; const pool = Array.from({ length: KENO_TOTAL }, (_, i) => i + 1).sort(() => Math.random() - 0.5); setPicks(pool.slice(0, picks.length || 5)); setDrawn([]); setResult(null); };

  async function play() {
    setResult(null); setDrawn([]);
    const r = await run<Res>("/api/games/keno/bet", { amount, params: { picks }, key: newKey() }, { deferBalance: true });
    if (!r) return;
    const x = r.round.result as { drawn: number[]; hits: number[] };
    setRevealing(true);
    for (const n of x.drawn) { setDrawn((d) => [...d, n]); await new Promise((res) => setTimeout(res, 170)); }
    setRevealing(false); setResult({ hits: x.hits.length, m: r.round.multiplier, payout: r.round.payout }); setBalance(r.balance); setVersion((v) => v + 1);
  }

  const controls = (
    <>
      <BetAmount value={amount} onChange={setAmount} cfg={cfg} disabled={locked} />
      <div>
        <Label aside={<span className="text-soft">{picks.length} / 10</span>}>Числа</Label>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={random} disabled={locked} className="h-9 rounded-lg bg-raised text-[13px] font-semibold text-soft hover:text-white disabled:opacity-50">🎲 Случайно</button>
          <button type="button" onClick={() => { setPicks([]); setDrawn([]); setResult(null); }} disabled={locked || !picks.length} className="h-9 rounded-lg bg-raised text-[13px] font-semibold text-soft hover:text-white disabled:opacity-50">Очистить</button>
        </div>
      </div>
      {picks.length > 0 && (
        <div>
          <Label>Выплаты: совпадения → множитель</Label>
          <div className="flex flex-wrap gap-1">
            {pays.map((m, h) => m > 0 && (
              <span key={h} className={`rounded-lg px-2 py-1 font-mono text-[12px] ${result?.hits === h ? "bg-gold text-ink" : "bg-ink text-soft"}`}>{h}: {m}×</span>
            ))}
          </div>
        </div>
      )}
      <ErrorLine text={error} />
      <PlayButton onClick={play} loading={locked} disabled={!cfg.enabled || !picks.length || !!betError(amount, cfg, balance)}>{cfg.enabled ? (picks.length ? "Играть" : "Выбери числа") : "Игра отключена"}</PlayButton>
    </>
  );

  const stage = (
    <div className="grid gap-4 p-4 sm:p-6">
      <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
        {Array.from({ length: KENO_TOTAL }, (_, i) => {
          const n = i + 1; const picked = picks.includes(n); const out = drawn.includes(n); const hit = picked && out;
          return (
            <motion.button key={n} type="button" onClick={() => toggle(n)} disabled={locked} aria-pressed={picked}
              animate={out ? { scale: [1.25, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}
              className={`grid aspect-square place-items-center rounded-xl font-mono text-[clamp(12px,2.6vw,16px)] font-bold transition-colors ${hit ? "bg-[linear-gradient(180deg,#fde68a,#f59e0b)] text-ink shadow-[0_0_18px_rgb(251_191_36/0.8)]" : picked ? "bg-brand-gradient text-white" : out ? "bg-cyan/25 text-cyan ring-1 ring-cyan/60" : "bg-black/35 text-soft ring-1 ring-white/10 hover:bg-raised"}`}>
              {hit ? "💎" : n}
            </motion.button>
          );
        })}
      </div>
      <p className={`h-8 text-center font-display text-[22px] font-bold ${result ? (result.m > 0 ? "text-gold" : "text-muted") : "text-transparent"}`} aria-live="polite">
        {result ? (result.m > 0 ? `${result.hits} совпад. · ${result.m}× · +${points(result.payout)}` : `Совпадений: ${result.hits}`) : "—"}
      </p>
    </div>
  );

  return <GameLayout slug="keno" controls={controls} stage={stage} footer={<RoundsPanel slug="keno" version={version} describe={describe} />} />;
}
