"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { WHEEL, type WheelRisk } from "@/lib/fair/extra";
import { points } from "@/lib/format";
import { BetAmount, betError, ErrorLine, GameLayout, Label, newKey, PlayButton, RoundsPanel, Segmented, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Res = { round: RoundView; balance: string };
const SEG = 360 / 20;
// Сектора-леденцы: снежно-белые пустые, красные, зелёные, золотые, синие и главный приз
const color = (m: number) => (m === 0 ? "#eef3ff" : m < 1.5 ? "#e8263f" : m < 2 ? "#1f9d55" : m < 3 ? "#ffd166" : m < 10 ? "#5b8cff" : "#ff4d6d");
const ink = (m: number) => (m === 0 ? "#8e9ac7" : m < 2 || m >= 3 ? "#fff" : "#2a1a00");
const RISK: Record<WheelRisk, string> = { low: "низкий", medium: "средний", high: "высокий" };
const describe = (r: RoundView) => { const x = r.result as { segment: number; risk: WheelRisk; multiplier: number } | null; return x ? `Риск ${RISK[x.risk]} · сектор ${x.segment + 1} · ${x.multiplier}×` : "—"; };

export function WheelGame({ cfg }: { cfg: GameConfig }) {
  const { balance, setBalance } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("10");
  const [risk, setRisk] = useState<WheelRisk>("medium");
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ seg: number; m: number; payout: string } | null>(null);
  const [version, setVersion] = useState(0);
  const segs = WHEEL[risk];
  // Уникальные множители и их шанс — легенда под колесом
  const legend = useMemo(() => [...new Set(segs)].sort((a, b) => a - b).map((m) => ({ m, n: segs.filter((x) => x === m).length })), [segs]);

  async function spin() {
    setResult(null);
    const r = await run<Res>("/api/games/wheel/bet", { amount, params: { risk }, key: newKey() }, { deferBalance: true });
    if (!r) return;
    const x = r.round.result as { segment: number; multiplier: number };
    setSpinning(true);
    const base = angle - (angle % 360);
    setAngle(base + 360 * 5 - x.segment * SEG - (Math.random() - 0.5) * SEG * 0.7);
    setTimeout(() => { setSpinning(false); setResult({ seg: x.segment, m: x.multiplier, payout: r.round.payout }); setBalance(r.balance); setVersion((v) => v + 1); }, 4300);
  }

  const controls = (
    <>
      <BetAmount value={amount} onChange={setAmount} cfg={cfg} disabled={busy || spinning} />
      <div><Label>Риск</Label><Segmented value={risk} onChange={setRisk} disabled={busy || spinning} options={[["low", "Низкий"], ["medium", "Средний"], ["high", "Высокий"]]} /></div>
      <div className="grid grid-cols-3 gap-1.5">
        {legend.map(({ m, n }) => (
          <div key={m} className="rounded-xl bg-ink px-2 py-1.5 text-center">
            <p className="font-mono text-[14px] font-bold" style={{ color: m === 0 ? "#dbe3ff" : color(m) }}>{m}×</p>
            <p className="text-[11px] text-muted">{n * 5}% шанс</p>
          </div>
        ))}
      </div>
      <ErrorLine text={error} />
      <PlayButton onClick={spin} loading={busy || spinning} disabled={!cfg.enabled || !!betError(amount, cfg, balance)}>{cfg.enabled ? "Крутить колесо" : "Игра отключена"}</PlayButton>
      <p className="text-[12px] text-muted">RTP 99% на любом уровне риска.</p>
    </>
  );

  const stage = (
    <div className="grid min-h-[420px] place-items-center gap-4 p-5">
      <div className="relative size-[min(78vw,360px)]">
        <svg viewBox="-110 -130 220 240" className="absolute inset-x-0 -top-[9%] z-10 h-[109%] w-full" aria-hidden><path d="M-10 -110 L10 -110 L0 -90Z" fill="#e8263f" stroke="#fff" strokeWidth="2" /><path d="m0-128 3.2 6.6 7.3 1-5.3 5.1 1.3 7.2L0-111.6l-6.5 3.5 1.3-7.2-5.3-5.1 7.3-1z" fill="#ffd166" /></svg>
        <motion.svg viewBox="-100 -100 200 200" className="size-full drop-shadow-[0_20px_40px_rgb(232_38_63/0.35)]" animate={{ rotate: angle }} transition={{ duration: spinning ? 4.2 : 0, ease: [0.12, 0.6, 0.12, 1] }} role="img" aria-label="Колесо фортуны">
          <circle r="99" fill="#ffd166" />
          <circle r="94" fill="#0f1633" />
          {segs.map((m, i) => {
            const a0 = ((i - 0.5) * SEG - 90) * (Math.PI / 180), a1 = ((i + 0.5) * SEG - 90) * (Math.PI / 180); const R = 92;
            const am = i * SEG - 90; const tx = 70 * Math.cos((am * Math.PI) / 180), ty = 70 * Math.sin((am * Math.PI) / 180);
            const hit = result?.seg === i && !spinning;
            return (
              <g key={i}>
                <path d={`M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)}Z`} fill={color(m)} stroke="#070b1f" strokeWidth="1" opacity={hit ? 1 : 0.92} />
                <text x={tx} y={ty} fill={ink(m)} fontSize="8" fontWeight="800" textAnchor="middle" dominantBaseline="central" transform={`rotate(${am + 90} ${tx} ${ty})`}>{m}×</text>
              </g>
            );
          })}
          {Array.from({ length: 20 }, (_, i) => { const a = (i * SEG - 90 + SEG / 2) * (Math.PI / 180); return <circle key={i} cx={96.5 * Math.cos(a)} cy={96.5 * Math.sin(a)} r="1.6" fill="#fff8d6" />; })}
          <circle r="20" fill="#0f1633" stroke="#ffd166" strokeWidth="3" />
          <path d="m0-12 3.5 7.4 8.1 1.1-5.9 5.7 1.4 8.1L0 6.4l-7.2 3.9 1.4-8.1-5.9-5.7 8.1-1.1z" fill="#ffd166" />
        </motion.svg>
      </div>
      <p className={`h-8 font-display text-[24px] font-bold ${result ? (result.m >= 1 ? "text-gold" : "text-muted") : "text-transparent"}`} aria-live="polite">
        {result ? (result.m > 0 ? `${result.m}× · +${points(result.payout)}` : "Пустой сектор") : "—"}
      </p>
    </div>
  );

  return <GameLayout slug="wheel" controls={controls} stage={stage} footer={<RoundsPanel slug="wheel" version={version} describe={describe} />} />;
}
