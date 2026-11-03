"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { coinMultiplier } from "@/lib/fair/extra";
import { points } from "@/lib/format";
import { BetAmount, betError, ErrorLine, GameLayout, Label, newKey, parsePoints, PlayButton, RoundsPanel, Segmented, Stat, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Side = "heads" | "tails";
type Res = { round: RoundView; balance: string };
const NAME: Record<Side, string> = { heads: "Орёл", tails: "Решка" };
const describe = (r: RoundView) => { const x = r.result as { sides: Side[]; side: Side; win: boolean } | null; return x ? `${NAME[x.side]} ×${x.sides.length}: ${x.sides.map((s) => (s === "heads" ? "О" : "Р")).join("")}` : "—"; };

/** Монета: золотая сторона — орёл (звезда), серебряная — решка (снежинка). */
export function Coin({ side, size = 160 }: { side: Side; size?: number }) {
  const gold = side === "heads";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label={NAME[side]}>
      <defs>
        <radialGradient id={`cf-${side}`} cx="35%" cy="30%"><stop offset="0" stopColor={gold ? "#fff6c8" : "#ffffff"} /><stop offset=".5" stopColor={gold ? "#fbbf24" : "#c7cbe0"} /><stop offset="1" stopColor={gold ? "#b45309" : "#5b6080"} /></radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#cf-${side})`} />
      <circle cx="50" cy="50" r="40" fill="none" stroke={gold ? "#92400e" : "#4b4f6b"} strokeWidth="2" strokeDasharray="3 3" opacity=".6" />
      {gold
        ? <path d="m50 24 7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z" fill="#92400e" opacity=".85" />
        : <g stroke="#3b3f5c" strokeWidth="4" strokeLinecap="round" opacity=".85">{/* Снежинка */}
            {[0, 60, 120].map((a) => <g key={a} transform={`rotate(${a} 50 50)`}><path d="M50 24v52M50 32l-7-6M50 32l7-6M50 68l-7 6M50 68l7 6" fill="none" /></g>)}
          </g>}
    </svg>
  );
}

export function CoinflipGame({ cfg }: { cfg: GameConfig }) {
  const { balance, setBalance } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("10");
  const [side, setSide] = useState<Side>("heads");
  const [flips, setFlips] = useState(1);
  const [shown, setShown] = useState<Side[]>([]);
  const [spinning, setSpinning] = useState<number | null>(null);
  const [face, setFace] = useState<Side>("heads");
  const [last, setLast] = useState<{ win: boolean; payout: string } | null>(null);
  const [version, setVersion] = useState(0);

  const m = coinMultiplier(flips, cfg.edgeBp);
  const units = parsePoints(amount) ?? 0n;

  async function play() {
    setLast(null); setShown([]);
    const r = await run<Res>("/api/games/coinflip/bet", { amount, params: { side, flips }, key: newKey() }, { deferBalance: true });
    if (!r) return;
    const x = r.round.result as { sides: Side[]; win: boolean };
    // Монета подбрасывается по очереди; серия обрывается на первом промахе
    for (let i = 0; i < x.sides.length; i++) {
      setSpinning(i); await new Promise((res) => setTimeout(res, 650));
      setFace(x.sides[i]!); setShown((p) => [...p, x.sides[i]!]); setSpinning(null);
      await new Promise((res) => setTimeout(res, 250));
      if (x.sides[i] !== side) break;
    }
    setLast({ win: x.win, payout: r.round.payout }); setBalance(r.balance); setVersion((v) => v + 1);
  }

  const playing = busy || spinning !== null;
  const controls = (
    <>
      <BetAmount value={amount} onChange={setAmount} cfg={cfg} disabled={playing} />
      <div><Label>Сторона</Label><Segmented value={side} onChange={setSide} disabled={playing} options={[["heads", "⭐ Орёл"], ["tails", "❄️ Решка"]]} /></div>
      <div>
        <Label aside={<span className="font-mono text-soft">{flips}</span>}>Бросков подряд</Label>
        <input type="range" min={1} max={10} value={flips} onChange={(e) => setFlips(Number(e.target.value))} disabled={playing} className="w-full accent-[#fbbf24]" aria-label="Количество бросков" />
        <p className="mt-1 text-[12px] text-muted">Все броски должны выпасть на выбранную сторону</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Множитель" value={`${m.toFixed(2)}×`} tone="accent" />
        <Stat label="Шанс" value={`${(100 / 2 ** flips).toFixed(flips > 6 ? 3 : 2)}%`} />
      </div>
      <Stat label="Выигрыш" value={points((units * BigInt(Math.round(m * 10000))) / 10000n)} />
      <ErrorLine text={error} />
      <PlayButton onClick={play} loading={playing} disabled={!cfg.enabled || !!betError(amount, cfg, balance)}>{cfg.enabled ? "Подбросить" : "Игра отключена"}</PlayButton>
    </>
  );

  const stage = (
    <div className="grid min-h-[380px] place-items-center gap-5 p-6">
      <div style={{ perspective: 800 }}>
        <motion.div key={spinning ?? "idle"} animate={spinning !== null ? { rotateY: [0, 1440], y: [0, -90, 0] } : { rotateY: 0 }} transition={{ duration: 0.65, ease: "easeInOut" }}
          className="drop-shadow-[0_20px_30px_rgb(0_0_0/0.5)]">
          <Coin side={face} size={170} />
        </motion.div>
      </div>
      <div className="flex min-h-10 flex-wrap justify-center gap-1.5">
        {Array.from({ length: flips }, (_, i) => {
          const s = shown[i];
          return (
            <motion.span key={i} initial={false} animate={s ? { scale: [1.3, 1] } : {}} className={`grid size-9 place-items-center rounded-full text-[11px] font-bold ring-1 ${s ? (s === side ? "bg-accent/20 text-accent ring-accent/50" : "bg-danger/20 text-danger ring-danger/50") : "bg-black/30 text-muted ring-white/10"}`}>
              {s ? (s === "heads" ? "О" : "Р") : i + 1}
            </motion.span>
          );
        })}
      </div>
      <AnimatePresence>
        {last && (
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`font-display text-[24px] font-bold ${last.win ? "text-gold" : "text-danger"}`}>
            {last.win ? `+${points(last.payout)}` : "Серия прервалась"}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );

  return <GameLayout slug="coinflip" controls={controls} stage={stage} footer={<RoundsPanel slug="coinflip" version={version} describe={describe} />} />;
}
