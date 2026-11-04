"use client";
import { sfx, winSfx } from "@/lib/sound";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { diceChance, diceMultiplier } from "@/lib/fair/outcomes";
import { points } from "@/lib/format";
import { BetAmount, betError, ErrorLine, GameLayout, Label, newKey, parsePoints, PlayButton, RoundsPanel, Segmented, Stat, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Res = { round: RoundView; balance: string };
// Зона проигрыша — леденец, зона выигрыша — ёлочная хвоя
const CANE = "repeating-linear-gradient(-45deg, #e8263f 0 8px, #fff 8px 14px)";
const PINE = "linear-gradient(90deg, #1f9d55, #3ee08f)";
const describe = (r: RoundView) => { const x = r.result as { roll: number; target: number; over: boolean } | null; return x ? `Бросок ${x.roll.toFixed(2)} · ${x.over ? "больше" : "меньше"} ${x.target.toFixed(2)}` : "—"; };

export function DiceGame({ cfg }: { cfg: GameConfig }) {
  const { balance } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("10");
  const [target, setTarget] = useState(50);
  const [over, setOver] = useState(true);
  const [last, setLast] = useState<{ roll: number; win: boolean; id: string } | null>(null);
  const [recent, setRecent] = useState<{ roll: number; win: boolean; id: string }[]>([]);
  const [version, setVersion] = useState(0);

  const chance = diceChance(target, over);
  const mult = diceMultiplier(target, over, cfg.edgeBp);
  const units = parsePoints(amount) ?? 0n;
  const profit = (units * BigInt(Math.round(mult * 10000))) / 10000n - units;

  async function roll() {
    const r = await run<Res>("/api/games/dice/bet", { amount, params: { target, over }, key: newKey() });
    if (!r) return;
    const x = r.round.result as { roll: number; win: boolean };
    const item = { roll: x.roll, win: x.win, id: r.round.id };
    sfx("dice"); winSfx(x.win ? r.round.multiplier : 0, 180);
    setLast(item); setRecent((p) => [item, ...p].slice(0, 12)); setVersion((v) => v + 1);
  }
  const setChance = (c: number) => { const t = Math.min(98, Math.max(2, over ? 100 - c : c)); setTarget(Math.round(t * 100) / 100); };

  const controls = (
    <>
      <BetAmount value={amount} onChange={setAmount} cfg={cfg} disabled={busy} />
      <div><Label>Направление</Label><Segmented value={over ? "over" : "under"} onChange={(v) => { setOver(v === "over"); setTarget(Math.round((100 - target) * 100) / 100); }} options={[["under", "Меньше"], ["over", "Больше"]]} disabled={busy} /></div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1"><span className="text-[11px] font-medium uppercase tracking-wider text-muted">Шанс, %</span>
          <input type="number" min={2} max={98} step={0.01} value={Number(chance.toFixed(2))} onChange={(e) => setChance(Number(e.target.value) || 2)} className="h-10 rounded-xl border border-line bg-ink px-3 font-mono tabular outline-none focus:border-accent" /></label>
        <Stat label="Множитель" value={`${mult.toFixed(4)}×`} />
      </div>
      <Stat label="Прибыль при выигрыше" value={points(profit)} tone="accent" />
      <ErrorLine text={error} />
      <PlayButton onClick={roll} loading={busy} disabled={!cfg.enabled || !!betError(amount, cfg, balance)}>{cfg.enabled ? "Бросить" : "Игра отключена"}</PlayButton>
    </>
  );

  const stage = (
    <div className="relative flex min-h-[360px] flex-col justify-between gap-8 bg-[radial-gradient(ellipse_at_top,rgb(143_220_255/0.12),transparent_60%)] p-5 sm:p-8">
      <div className="flex min-h-8 flex-wrap justify-end gap-1.5">
        <AnimatePresence initial={false}>
          {recent.map((r) => (
            <motion.span key={r.id} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className={`rounded-lg px-2 py-1 font-mono text-[12px] font-semibold tabular ${r.win ? "bg-accent/15 text-accent" : "bg-raised text-muted"}`}>{r.roll.toFixed(2)}</motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div className="grid place-items-center">
        <AnimatePresence mode="popLayout">
          <motion.p key={last?.id ?? "none"} initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`font-display text-[64px] font-bold tabular sm:text-[88px] ${last ? (last.win ? "text-accent" : "text-danger") : "text-raised"}`}>
            {last ? last.roll.toFixed(2) : "00.00"}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="pb-2">
        <div className="relative h-3 rounded-full bg-ink ring-1 ring-line">
          <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: `${target}%`, background: over ? CANE : PINE, opacity: 0.9 }} />
          <div className="absolute inset-y-0 right-0 rounded-r-full" style={{ width: `${100 - target}%`, background: over ? PINE : CANE, opacity: 0.9 }} />
          {last && (
            <motion.div key={last.id} initial={{ left: "50%", opacity: 0 }} animate={{ left: `${last.roll}%`, opacity: 1 }} transition={{ type: "spring", stiffness: 140, damping: 18 }}
              className="absolute -top-9 -translate-x-1/2">
              <span className={`block rounded-lg px-2 py-1 font-mono text-[12px] font-bold text-accent-ink ${last.win ? "bg-accent" : "bg-danger text-white"}`}>{last.roll.toFixed(2)}</span>
              <span className={`mx-auto block size-2 rotate-45 ${last.win ? "bg-accent" : "bg-danger"} -mt-1`} />
            </motion.div>
          )}
          <input type="range" min={2} max={98} step={0.5} value={target} disabled={busy} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Порог"
            className="absolute inset-0 h-3 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-lg [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-lg [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg" />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[12px] text-muted"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        <p className="mt-3 text-center text-[14px] text-soft">Выигрыш, если бросок <b className="text-white">{over ? "больше" : "меньше"} {target.toFixed(2)}</b></p>
      </div>
    </div>
  );

  return <GameLayout slug="dice" controls={controls} stage={stage} footer={<RoundsPanel slug="dice" version={version} describe={describe} />} />;
}
