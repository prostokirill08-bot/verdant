"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { SLEDS, sledMult } from "@/lib/fair/cards";
import { points } from "@/lib/format";
import { BetAmount, betError, ErrorLine, GameLayout, Label, newKey, PlayButton, RoundsPanel, scrollToStage, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Result = { winner: number; order: number[]; pick: number; payoutMultiplier: number };
type Res = { round: RoundView; balance: string };
const describe = (r: RoundView) => { const x = r.result as Result | null; return x ? `Ставка: ${SLEDS[x.pick]!.emoji} · Первым: ${SLEDS[x.winner]!.emoji} ${SLEDS[x.winner]!.name}` : "—"; };
const RACE = 4.2;     // секунд у победителя
const FINISH = 86;    // финишная линия, % ширины трассы

/** Путь саней: случайные рывки, но место на финише задано результатом раунда. */
function path(place: number, seed: number) {
  let s = seed; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const pts = [0]; for (let k = 1; k < 6; k++) pts.push(Math.min(FINISH - 4, (k / 6) * FINISH + (rnd() - 0.5) * 14));
  for (let k = 2; k < pts.length; k++) pts[k] = Math.max(pts[k]!, pts[k - 1]! + 2);
  pts.push(FINISH, FINISH + 6 - place);
  const dur = RACE + place * 0.32; const total = dur + 0.6;   // после финиша сани ещё немного катятся
  return { left: pts.map((p) => `${p}%`), times: [...Array.from({ length: 7 }, (_, k) => (k / 6) * (dur / total)), 1], duration: total };
}

export function SledRaceGame({ cfg }: { cfg: GameConfig }) {
  const { balance, setBalance } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("10");
  const [pick, setPick] = useState(0);
  const [race, setRace] = useState<{ r: Result; payout: bigint; id: string; seed: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [version, setVersion] = useState(0);

  async function start() {
    const r = await run<Res>("/api/games/sledrace/bet", { amount, params: { pick }, key: newKey() }, { deferBalance: true });
    if (!r) return;
    setRace({ r: r.round.result as unknown as Result, payout: BigInt(r.round.payout), id: r.round.id, seed: Math.floor(Math.random() * 1e5) });
    setRunning(true); scrollToStage();
    setTimeout(() => { setRunning(false); setBalance(r.balance); setVersion((v) => v + 1); }, (RACE + 1.4) * 1000);
  }
  const paths = useMemo(() => race ? SLEDS.map((_, i) => path(race.r.order.indexOf(i), race.seed + i * 977)) : null, [race]);

  const controls = (
    <>
      <BetAmount value={amount} onChange={setAmount} cfg={cfg} disabled={busy || running} />
      <div>
        <Label>На кого ставишь</Label>
        <div className="grid gap-1.5" role="radiogroup">
          {SLEDS.map((s, i) => (
            <button key={s.name} type="button" role="radio" aria-checked={pick === i} onClick={() => setPick(i)} disabled={running} data-testid={`sled-${i}`}
              className={`flex h-11 items-center gap-2.5 rounded-xl px-3 text-left transition-colors disabled:opacity-60 ${pick === i ? "bg-raised ring-2" : "bg-ink hover:bg-raised/60"}`} style={pick === i ? { ["--tw-ring-color" as string]: s.color } : undefined}>
              <span className="text-[22px]" aria-hidden>{s.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{s.name}</span>
              <span className="text-[11.5px] text-muted">{Math.round(s.p * 100)}%</span>
              <span className="w-14 text-right font-mono text-[14px] font-bold" style={{ color: s.color }}>{sledMult(i, cfg.edgeBp).toFixed(2)}×</span>
            </button>
          ))}
        </div>
      </div>
      <ErrorLine text={error} />
      <PlayButton onClick={start} loading={busy || running} disabled={!cfg.enabled || !!betError(amount, cfg, balance)}>{cfg.enabled ? "Старт!" : "Игра отключена"}</PlayButton>
    </>
  );

  const stage = (
    <div className="relative grid min-h-[440px] content-center gap-3 p-3 sm:p-6">
      <div className="relative overflow-hidden rounded-3xl bg-[#dfe9ff] bg-cover bg-center p-2 pt-[clamp(70px,16vw,120px)] shadow-inner ring-1 ring-white/30" style={{ backgroundImage: "linear-gradient(180deg, transparent 0, transparent 22%, #eef4ffd9 45%), url(/img/ny/sprites/sled-bg.webp)" }} data-testid="sled-track">
        {/* Клетчатый финиш */}
        <div aria-hidden className="absolute bottom-2 top-[clamp(70px,16vw,120px)] w-3 bg-[repeating-conic-gradient(#1e1b4b_0_25%,#fff_0_50%)] [background-size:12px_12px]" style={{ left: `calc(${FINISH}% + 30px)` }} />
        <div className="relative grid gap-1.5">
          {SLEDS.map((s, i) => {
            const p = paths?.[i]; const place = race ? race.r.order.indexOf(i) : -1;
            return (
              <div key={s.name} className={`relative h-[clamp(48px,11vw,62px)] rounded-xl ${race?.r.pick === i ? "bg-[#ffd166]/30 ring-2 ring-[#ffb02e]/70" : "bg-white/50"}`}>
                <div aria-hidden className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 border-t-2 border-dashed border-[#9fb6e8]" />
                <motion.div key={race?.id ?? "idle"} className="absolute top-1/2 -translate-y-1/2" initial={{ left: "0%" }}
                  animate={p ? { left: p.left } : { left: "0%" }} transition={p ? { duration: p.duration, times: p.times, ease: "linear" } : undefined}>
                  <span className="relative flex items-end">
                    <span className="text-[clamp(26px,6.5vw,36px)] leading-none [transform:scaleX(-1)]" aria-hidden>{s.emoji}</span>
                    <span aria-hidden className="absolute -bottom-1 left-[-4px] h-2 w-[calc(100%+10px)] rounded-full" style={{ background: s.color, boxShadow: "0 2px 0 #00000040" }} />
                  </span>
                </motion.div>
                <AnimatePresence>
                  {race && !running && <motion.span initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} className={`absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[12px] font-bold ${place === 0 ? "bg-gold text-ink" : "bg-[#1e1b4b]/70 text-white"}`}>{place + 1}</motion.span>}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid min-h-10 place-items-center">
        <AnimatePresence mode="wait">
          {race && !running && (
            <motion.p key={race.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`font-display text-[20px] font-bold ${race.payout > 0n ? "text-gold" : "text-white/80"}`} data-testid="sled-result">
              {race.payout > 0n ? `${SLEDS[race.r.winner]!.emoji} Первым приехал твой саночник! +${points(race.payout)}` : `Первым приехал ${SLEDS[race.r.winner]!.emoji} ${SLEDS[race.r.winner]!.name}`}
            </motion.p>
          )}
          {running && <motion.p key="go" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-display text-[20px] font-bold text-white">Поехали! 🛷</motion.p>}
        </AnimatePresence>
      </div>
    </div>
  );

  return <GameLayout slug="sledrace" controls={controls} stage={stage} footer={<RoundsPanel slug="sledrace" version={version} describe={describe} />} />;
}
