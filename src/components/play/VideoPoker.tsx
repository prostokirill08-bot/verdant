"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import { VP_PAYS } from "@/lib/fair/cards";
import { points } from "@/lib/format";
import { PlayingCard, type CardData } from "./cards/PlayingCard";
import { BetAmount, betError, ErrorLine, GameLayout, newKey, PlayButton, RoundsPanel, scrollToStage, useGameRequest, type GameConfig, type RoundView } from "./kit";

type VpRound = RoundView & { hand: CardData[]; eval: { rank: string; mult: number; name: string } };
type Res = { round: VpRound; balance: string };
const describe = (r: RoundView) => (r.result as { name?: string } | null)?.name ?? "—";

export function VideoPokerGame({ cfg }: { cfg: GameConfig }) {
  const { balance, user } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("10");
  const [round, setRound] = useState<VpRound | null>(null);
  const [held, setHeld] = useState([false, false, false, false, false]);
  const [deal, setDeal] = useState(0);   // номер раздачи — карты перелетают заново
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user) return;
    api<{ round: VpRound | null }>("/api/videopoker/active").then((r) => r.round && setRound(r.round)).catch(() => {});
  }, [user]);

  const active = round?.status === "ACTIVE";
  const bet = round ? BigInt(round.bet) : 0n;
  async function start() {
    const r = await run<Res>("/api/videopoker/start", { amount, key: newKey() });
    if (r) { setRound(r.round); setHeld([false, false, false, false, false]); setDeal((d) => d + 1); scrollToStage(); }
  }
  async function draw() {
    const r = await run<Res>("/api/videopoker/draw", { held });
    if (r) { setRound(r.round); setVersion((v) => v + 1); }
  }
  const toggle = (i: number) => active && !busy && setHeld((h) => h.map((x, k) => (k === i ? !x : x)));
  const combo = round?.eval;
  const win = round && !active && BigInt(round.payout) > 0n;

  const controls = (
    <>
      <BetAmount value={active ? (Number(bet) / 100).toString() : amount} onChange={setAmount} cfg={cfg} disabled={busy || active} />
      <ErrorLine text={error} />
      {active
        ? <PlayButton onClick={draw} loading={busy}>{held.every(Boolean) ? "Оставить все" : `Заменить ${held.filter((h) => !h).length} карт${held.filter((h) => !h).length === 1 ? "у" : held.filter((h) => !h).length < 5 ? "ы" : ""}`}</PlayButton>
        : <PlayButton onClick={start} loading={busy} disabled={!cfg.enabled || !!betError(amount, cfg, balance)}>{cfg.enabled ? "Раздать" : "Игра отключена"}</PlayButton>}
      <p className="rounded-xl bg-ink p-3 text-[12.5px] text-muted">Нажми на карты, которые хочешь оставить, — остальные заменятся. Выигрыш от пары валетов и выше.</p>
    </>
  );

  const stage = (
    <div className="grid min-h-[440px] content-center gap-4 p-3 sm:p-6">
      {/* Таблица выплат: текущая комбинация подсвечена */}
      <div className="mx-auto grid w-full max-w-[560px] grid-cols-2 gap-x-2 rounded-2xl bg-[#0b1638]/90 p-2 ring-1 ring-[#8fdcff]/30 sm:gap-x-4 sm:p-2.5" data-testid="vp-paytable">
        {VP_PAYS.map(([k, name, m]) => {
          const on = combo?.rank === k;
          return (
            <div key={k} className={`flex items-center justify-between gap-1 rounded-lg px-2 py-1 text-[10.5px] sm:px-2.5 sm:text-[13px] ${on ? "bg-gold text-ink" : "text-[#cfe6ff]"}`}>
              <span className="truncate font-semibold uppercase sm:tracking-wide">{name}</span>
              <span className="shrink-0 font-mono font-bold">{m}× {bet > 0n && <span className={`ml-1 hidden text-[11px] sm:inline ${on ? "text-ink/70" : "text-muted"}`}>{points(bet * BigInt(m))}</span>}</span>
            </div>
          );
        })}
      </div>
      <div className="mx-auto grid w-full max-w-[560px] grid-cols-5 gap-[clamp(6px,2vw,14px)]">
        {Array.from({ length: 5 }, (_, i) => {
          const c = round?.hand[i];
          return (
            <button key={`${deal}-${i}-${c ? c.rank * 4 + c.suit : "x"}`} type="button" onClick={() => toggle(i)} disabled={!active} className="relative grid justify-items-center gap-1.5 disabled:cursor-default" data-testid="vp-card" aria-pressed={held[i]}>
              <motion.div animate={{ y: active && held[i] ? -10 : 0 }} className="w-full">
                <PlayingCard card={c} hidden={!c} size="lg" delay={i * 0.08} from={{ x: 0, y: -60 }} glow={active && held[i] ? "#ffd166" : undefined} dim={!!round && !active && !win} />
              </motion.div>
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-opacity sm:text-[11px] ${held[i] && active ? "bg-gold text-ink opacity-100" : "opacity-0"}`}>Держать</span>
            </button>
          );
        })}
      </div>
      <div className="grid min-h-12 place-items-center">
        <AnimatePresence mode="wait">
          {round && (
            <motion.p key={`${round.id}-${round.status}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: active ? 0.4 : 0.6 }}
              className={`font-display text-[20px] font-bold ${active ? "text-[#cfe6ff]" : win ? "text-gold" : "text-white/60"}`} data-testid="vp-status">
              {active ? (combo && combo.mult > 0 ? `На руках: ${combo.name}` : "Выбери карты, которые оставить") : win ? `${combo?.name} · +${points(round.payout)}` : "Нет комбинации"}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return <GameLayout slug="videopoker" controls={controls} stage={stage} footer={<RoundsPanel slug="videopoker" version={version} describe={describe} />} />;
}
