"use client";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { PLINKO_TABLE, plinkoRtp, type PlinkoRisk, type PlinkoRows } from "@/lib/fair/outcomes";
import { points } from "@/lib/format";
import { BetAmount, betError, ErrorLine, GameLayout, Label, newKey, PlayButton, RoundsPanel, Segmented, Stat, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Res = { round: RoundView; balance: string };
type Ball = { id: string; path: number[]; bucket: number; balance: string; mult: number };
const describe = (r: RoundView) => { const p = r.params as { rows: number; risk: string }; const x = r.result as { bucket: number } | null; return `${p.rows} рядов · ${RISK[p.risk as PlinkoRisk]} риск · лунка ${(x?.bucket ?? 0) + 1}`; };
const RISK: Record<PlinkoRisk, string> = { low: "низкий", medium: "средний", high: "высокий" };

const W = 1000;
const GARLAND = ["#ff4d5e", "#ffd166", "#3ee08f", "#8fdcff"];
const label = (m: number, rows: number) => `${m}${rows < 16 ? "×" : ""}`;
const labelSize = (m: number, rows: number, s: number) => Math.min(26, s * 0.3, (s * 0.84) / (label(m, rows).length * 0.62));
const tone = (m: number) => (m >= 10 ? "#e8263f" : m >= 2 ? "#ffd166" : m >= 1 ? "#3ee08f" : "#2a3870");

export function PlinkoGame({ cfg }: { cfg: GameConfig }) {
  const { balance, setBalance } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("5");
  const [rows, setRows] = useState<PlinkoRows>(12);
  const [risk, setRisk] = useState<PlinkoRisk>("medium");
  const [balls, setBalls] = useState<Ball[]>([]);
  const [hit, setHit] = useState<{ bucket: number; n: number } | null>(null);
  const [recent, setRecent] = useState<{ id: string; mult: number }[]>([]);
  const [version, setVersion] = useState(0);

  const s = W / (rows + 2);
  const top = s * 0.9;
  const H = top + rows * s + s * 0.9;
  const table = PLINKO_TABLE[rows][risk];

  const pegs = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < rows; i++) for (let j = 0; j <= i + 2; j++) out.push({ x: W / 2 + (j - (i + 2) / 2) * s, y: top + i * s });
    return out;
  }, [rows, s, top]);

  async function drop() {
    if (balls.length >= 12) return;
    const r = await run<Res>("/api/games/plinko/bet", { amount, params: { rows, risk }, key: newKey() }, { deferBalance: true });
    if (!r) return;
    const x = r.round.result as { path: number[]; bucket: number };
    setBalls((b) => [...b, { id: r.round.id, path: x.path, bucket: x.bucket, balance: r.balance, mult: r.round.multiplier }]);
  }
  function landed(b: Ball) {
    setBalls((list) => list.filter((x) => x.id !== b.id));
    setBalance(b.balance);
    setHit((h) => ({ bucket: b.bucket, n: (h?.n ?? 0) + 1 }));
    setRecent((p) => [{ id: b.id, mult: b.mult }, ...p].slice(0, 10));
    setVersion((v) => v + 1);
  }

  const inFlight = balls.length > 0;
  const controls = (
    <>
      <BetAmount value={amount} onChange={setAmount} cfg={cfg} disabled={busy} />
      <div><Label>Риск</Label><Segmented value={risk} onChange={setRisk} disabled={inFlight} options={[["low", "Низкий"], ["medium", "Средний"], ["high", "Высокий"]]} /></div>
      <div><Label>Ряды</Label><Segmented value={rows} onChange={setRows} disabled={inFlight} options={[[8, "8"], [12, "12"], [16, "16"]]} /></div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Макс. множитель" value={`${table[0]}×`} />
        <Stat label="RTP" value={`${(plinkoRtp(rows, risk) * 100).toFixed(2)}%`} />
      </div>
      <ErrorLine text={error} />
      <PlayButton onClick={drop} loading={busy} disabled={!cfg.enabled || balls.length >= 12 || !!betError(amount, cfg, balance)}>{cfg.enabled ? "Бросить шарик" : "Игра отключена"}</PlayButton>
      <p className="text-[12px] text-muted">Можно бросать несколько шариков подряд — до 12 одновременно.</p>
    </>
  );

  const stage = (
    <div className="relative p-3 sm:p-6">
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1 sm:right-5 sm:top-5">
        {recent.slice(0, 6).map((r) => <span key={r.id} className="rounded-md px-2 py-0.5 text-center font-mono text-[11.5px] font-bold text-accent-ink" style={{ background: tone(r.mult) }}>{r.mult}×</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-[640px]" role="img" aria-label="Доска Plinko">
        <defs>
          <radialGradient id="ball" cx="35%" cy="30%"><stop offset="0" stopColor="#fff" /><stop offset=".35" stopColor="#ff6b7a" /><stop offset="1" stopColor="#9e0f2a" /></radialGradient>
        </defs>
        {/* Штырьки — лампочки гирлянды */}
        {pegs.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r={s * 0.2} fill={GARLAND[i % GARLAND.length]} opacity={0.18} /><circle cx={p.x} cy={p.y} r={s * 0.095} fill={GARLAND[i % GARLAND.length]} /></g>)}
        {table.map((m, b) => {
          const cx = W / 2 + (b - rows / 2) * s; const y = top + rows * s - s * 0.25;
          const active = hit?.bucket === b;
          return (
            <motion.g key={`${rows}-${risk}-${b}-${active ? hit!.n : 0}`} initial={active ? { y: 0 } : false} animate={active ? { y: [0, s * 0.18, 0] } : {}} transition={{ duration: 0.3 }}>
              <rect x={cx - s * 0.46} y={y} width={s * 0.92} height={s * 0.62} rx={s * 0.12} fill={tone(m)} opacity={active ? 1 : 0.88} />
              <text x={cx} y={y + s * 0.4} textAnchor="middle" fontSize={labelSize(m, rows, s)} fontWeight={700} fill={m < 1 ? "#c3cbd0" : m >= 10 ? "#fff" : "#04150d"} style={{ fontFamily: "var(--font-geist-mono)" }}>{label(m, rows)}</text>
            </motion.g>
          );
        })}
        {balls.map((b) => <BallPath key={b.id} ball={b} s={s} top={top} rows={rows} onDone={() => landed(b)} />)}
      </svg>
    </div>
  );

  return <GameLayout slug="plinko" controls={controls} stage={stage} footer={<RoundsPanel slug="plinko" version={version} describe={describe} />} />;
}

/** Анимация шарика по пути, который рассчитал сервер: удар о штырёк → отскок → следующий ряд. */
function BallPath({ ball, s, top, rows, onDone }: { ball: Ball; s: number; top: number; rows: number; onDone: () => void }) {
  const { xs, ys, times } = useMemo(() => {
    const xs: number[] = [W / 2], ys: number[] = [top - s * 0.8];
    let k = 0;
    for (let i = 0; i < rows; i++) {
      const px = W / 2 + (k - i / 2) * s; const py = top + i * s - s * 0.22;
      xs.push(px); ys.push(py);
      k += ball.path[i]!;
      const nx = W / 2 + (k - (i + 1) / 2) * s;
      xs.push((px + nx) / 2); ys.push(py - s * 0.18);
    }
    xs.push(W / 2 + (k - rows / 2) * s); ys.push(top + rows * s);
    const times = xs.map((_, i) => i / (xs.length - 1));
    return { xs, ys, times };
  }, [ball.path, rows, s, top]);
  return (
    <motion.circle r={s * 0.17} fill="url(#ball)" initial={{ cx: xs[0], cy: ys[0] }} animate={{ cx: xs, cy: ys }}
      transition={{ duration: 0.16 * rows + 0.3, times, ease: "linear" }} onAnimationComplete={onDone} />
  );
}
