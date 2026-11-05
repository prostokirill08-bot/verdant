"use client";
import { sfx, winSfx } from "@/lib/sound";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { points } from "@/lib/format";
import { PlayingCard, type CardData } from "./cards/PlayingCard";
import { ErrorLine, GameLayout, Label, newKey, PlayButton, RoundsPanel, scrollToStage, unitsToInput, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Side = "player" | "banker" | "tie";
type Result = { player: CardData[]; banker: CardData[]; playerScore: number; bankerScore: number; winner: Side };
type Res = { round: RoundView; balance: string };
const CHIPS = [100n, 500n, 1000n, 5000n, 10000n, 50000n];
const CHIP_COLOR: Record<string, string> = { "100": "#c3cbd0", "500": "#22b8cf", "1000": "#00c47a", "5000": "#f5b84a", "10000": "#ff8a3d", "50000": "#6e7bff" };
const short = (v: bigint) => { const r = Number(v) / 100; return r >= 1000 ? `${Math.round(r / 100) / 10}k` : String(r); };
const NAMES: Record<Side, string> = { player: "Игрок", banker: "Банкир", tie: "Ничья" };
const describe = (r: RoundView) => { const x = r.result as Result | null; return x ? `${NAMES[x.winner]} · ${x.playerScore}:${x.bankerScore}` : "—"; };
// Порядок появления карт: игрок, банкир, игрок, банкир, затем третьи карты
const order = (side: "player" | "banker", i: number) => (i < 2 ? i * 2 + (side === "banker" ? 1 : 0) : side === "player" ? 4 : 5);

export function BaccaratGame({ cfg }: { cfg: GameConfig }) {
  const { balance, setBalance } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [chip, setChip] = useState(1000n);
  const [bets, setBets] = useState<Record<Side, bigint>>({ player: 0n, banker: 0n, tie: 0n });
  const [last, setLast] = useState<Record<Side, bigint> | null>(null);
  const [res, setRes] = useState<{ r: Result; payout: bigint; id: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [history, setHistory] = useState<Side[]>([]);
  const [version, setVersion] = useState(0);
  const total = bets.player + bets.banker + bets.tie;

  const place = (s: Side) => { if (!playing) { sfx("chip"); setBets((b) => ({ ...b, [s]: b[s] + chip })); setRes(null); } };
  async function deal() {
    const r = await run<Res>("/api/games/baccarat/bet", { params: { player: unitsToInput(bets.player), banker: unitsToInput(bets.banker), tie: unitsToInput(bets.tie) }, key: newKey() }, { deferBalance: true });
    if (!r) return;
    const x = r.round.result as unknown as Result;
    scrollToStage(); setPlaying(true); setRes({ r: x, payout: BigInt(r.round.payout), id: r.round.id }); setLast(bets);
    const n = x.player.length + x.banker.length;
    for (let i = 0; i < n; i++) sfx("card", { delay: i * 450 + 100 });
    const staked = Number(bets.player + bets.banker + bets.tie);
    const payout = Number(r.round.payout);
    setTimeout(() => (payout > 0 && payout >= staked ? winSfx(payout / staked) : payout > 0 ? sfx("coin") : sfx("lose")), n * 450 + 400);
    setTimeout(() => { setPlaying(false); setBalance(r.balance); setHistory((h) => [x.winner, ...h].slice(0, 24)); setVersion((v) => v + 1); }, n * 450 + 900);
  }
  const revealAt = res ? (res.r.player.length + res.r.banker.length) * 0.45 + 0.3 : 0;

  const field = (s: Side, odds: string, cls: string) => (
    <button type="button" onClick={() => place(s)} disabled={playing} data-testid={`bac-${s}`}
      className={`relative grid h-20 place-items-center rounded-2xl border-2 text-center transition-[filter] hover:brightness-110 disabled:cursor-not-allowed ${cls} ${res && !playing && res.r.winner === s ? "ring-4 ring-accent" : ""}`}>
      <span><span className="block font-display text-[18px] font-bold uppercase tracking-wider">{NAMES[s]}</span><span className="text-[12px] font-semibold opacity-80">{odds}</span></span>
      {bets[s] > 0n && <span className="absolute -right-1.5 -top-1.5 grid h-7 min-w-7 place-items-center rounded-full px-1 font-mono text-[11px] font-bold text-ink shadow ring-2 ring-ink" style={{ background: CHIP_COLOR[(CHIPS.filter((c) => c <= bets[s]).at(-1) ?? CHIPS[0]!).toString()] }}>{short(bets[s])}</span>}
    </button>
  );

  const controls = (
    <>
      <div>
        <Label>Фишка</Label>
        <div className="grid grid-cols-6 gap-1.5">
          {CHIPS.map((c) => (
            <button key={c.toString()} type="button" onClick={() => setChip(c)} aria-pressed={chip === c}
              className={`grid aspect-square place-items-center rounded-full font-mono text-[11px] font-bold text-ink transition-transform ${chip === c ? "scale-110 ring-2 ring-white" : "opacity-80 hover:opacity-100"}`}
              style={{ background: `radial-gradient(circle at 50% 35%, #fff8, transparent 60%), ${CHIP_COLOR[c.toString()]}` }}>{short(c)}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => setBets({ player: 0n, banker: 0n, tie: 0n })} disabled={playing || !total} className="h-10 rounded-xl bg-raised text-[13px] font-semibold text-soft hover:text-white disabled:opacity-40">Очистить</button>
        <button type="button" onClick={() => setBets((b) => ({ player: b.player * 2n, banker: b.banker * 2n, tie: b.tie * 2n }))} disabled={playing || !total} className="h-10 rounded-xl bg-raised text-[13px] font-semibold text-soft hover:text-white disabled:opacity-40">×2</button>
        <button type="button" onClick={() => last && setBets(last)} disabled={playing || !last} className="h-10 rounded-xl bg-raised text-[13px] font-semibold text-soft hover:text-white disabled:opacity-40">Повторить</button>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-ink px-3 py-2 text-[13px]"><span className="text-muted">Сумма ставок</span><span className="font-mono font-semibold">{points(total)}</span></div>
      <ErrorLine text={error || (total > BigInt(cfg.maxBet) ? `Больше лимита ${points(cfg.maxBet)}` : "")} />
      <PlayButton onClick={deal} loading={busy || playing} disabled={!cfg.enabled || !total || total > BigInt(balance) || total > BigInt(cfg.maxBet) || total < BigInt(cfg.minBet)}>{cfg.enabled ? "Раздать" : "Игра отключена"}</PlayButton>
      <p className="rounded-xl bg-ink p-3 text-[12.5px] text-muted">Побеждает сторона, у которой сумма очков ближе к 9 (десятки и картинки — 0). При ничьей ставки на Игрока и Банкира возвращаются.</p>
    </>
  );

  const hand = (side: "player" | "banker") => {
    const cards = res?.r[side] ?? []; const score = res ? (side === "player" ? res.r.playerScore : res.r.bankerScore) : null;
    return (
      <div className="flex flex-col items-center gap-2">
        <p className={`text-[12px] font-bold uppercase tracking-[0.16em] ${side === "player" ? "text-[#45c8f0]" : "text-[#ff6fb0]"}`}>{NAMES[side]}
          {score !== null && <motion.span key={res!.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: revealAt }} className="ml-2 rounded-md bg-black/50 px-2 py-0.5 font-mono text-[15px] text-white" data-testid={`bac-score-${side}`}>{score}</motion.span>}
        </p>
        <div className="flex min-h-[clamp(76px,21vw,118px)] -space-x-[clamp(14px,4vw,24px)]">
          {cards.map((c, i) => <PlayingCard key={`${res!.id}-${side}-${i}`} card={c} delay={order(side, i) * 0.45} from={{ x: 0, y: -120 }} />)}
        </div>
      </div>
    );
  };

  const stage = (
    <div className="relative grid min-h-[440px] content-between gap-4 p-4 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-3 rounded-[40px] bg-[radial-gradient(120%_90%_at_50%_0%,#1f6b45,#0b2f1f_75%)] ring-2 ring-accent/30" />
      <div className="relative flex min-h-6 flex-wrap justify-center gap-1" aria-label="Последние раздачи">
        {history.map((h, i) => <span key={i} className="grid size-6 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: h === "player" ? "#1b7fa3" : h === "banker" ? "#b8306f" : "#1f9d55" }}>{h === "player" ? "И" : h === "banker" ? "Б" : "Н"}</span>)}
      </div>
      <div className="relative grid grid-cols-2 gap-2">{hand("player")}{hand("banker")}</div>
      <div className="relative grid min-h-9 place-items-center">
        <AnimatePresence>
          {res && <motion.p key={res.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: revealAt + 0.15 }} className="font-display text-[20px] font-bold text-accent" data-testid="bac-result">
            {res.r.winner === "tie" ? "Ничья" : `Победа: ${NAMES[res.r.winner]}`}{res.payout > 0n ? ` · +${points(res.payout)}` : ""}
          </motion.p>}
        </AnimatePresence>
      </div>
      <div className="relative grid grid-cols-[1fr_0.8fr_1fr] gap-2 text-white">
        {field("player", "1 : 1", "border-[#45c8f0]/70 bg-[#0b2a33]/85 shadow-[0_0_20px_-8px_#45c8f0]")}
        {field("tie", "8 : 1", "border-[#8bea4e]/70 bg-[#123a1e]/85 shadow-[0_0_20px_-8px_#8bea4e]")}
        {field("banker", "0,95 : 1", "border-[#ff6fb0]/70 bg-[#3a0f24]/85 shadow-[0_0_20px_-8px_#ff6fb0]")}
      </div>
    </div>
  );

  return <GameLayout slug="baccarat" controls={controls} stage={stage} footer={<RoundsPanel slug="baccarat" version={version} describe={describe} />} />;
}
