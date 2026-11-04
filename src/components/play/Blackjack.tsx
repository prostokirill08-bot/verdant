"use client";
import { sfx } from "@/lib/sound";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import { points } from "@/lib/format";
import { PlayingCard, type CardData } from "./cards/PlayingCard";
import { BetAmount, betError, ErrorLine, GameLayout, newKey, PlayButton, RoundsPanel, scrollToStage, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Total = { total: number; soft: boolean };
type Hand = { cards: CardData[]; bet: 1 | 2; done: boolean; split: boolean; doubled?: boolean; total: Total };
type Outcome = "win" | "lose" | "push" | "blackjack";
type Table = { hands: Hand[]; dealer: CardData[]; dealerTotal: Total; hidden: boolean; active: number; allowed: Record<"hit" | "stand" | "double" | "split", boolean>; outcomes: Outcome[] | null; base: string };
type BjRound = RoundView & { table: Table };
type Res = { round: BjRound; balance: string };

const describe = (r: RoundView) => { const x = r.result as { player?: number[]; dealer?: number } | null; return x?.player ? `Игрок ${x.player.join(" / ")} · Дилер ${x.dealer}` : "—"; };
const totalLabel = (t: Total, n: number) => (n === 2 && t.total === 21 ? "21" : t.soft && t.total < 21 ? `${t.total - 10}/${t.total}` : String(t.total));
const OUT: Record<Outcome, [string, string]> = { blackjack: ["Блэкджек!", "#ffd166"], win: ["Победа", "#3ee08f"], push: ["Ничья", "#8fdcff"], lose: ["Проигрыш", "#ff5c7a"] };

export function BlackjackGame({ cfg }: { cfg: GameConfig }) {
  const { balance, user } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("10");
  const [round, setRound] = useState<BjRound | null>(null);
  const [version, setVersion] = useState(0);
  const fresh = useRef(false);   // только что раздали — карты летят по очереди

  useEffect(() => {
    if (!user) return;
    api<{ round: BjRound | null }>("/api/blackjack/active").then((r) => r.round && setRound(r.round)).catch(() => {});
  }, [user]);

  const t = round?.table; const active = round?.status === "ACTIVE";
  const base = t ? BigInt(t.base) : 0n; const canPay = base <= BigInt(balance);

  async function deal() {
    fresh.current = true; const r = await run<Res>("/api/blackjack/start", { amount, key: newKey() });
    if (!r) return;
    setRound(r.round); scrollToStage();
    for (let i = 0; i < 4; i++) sfx("card", { delay: i * 200 });
    if (r.round.status !== "ACTIVE") { setVersion((v) => v + 1); bjResult(r.round, 1500); }
  }
  /** Звук итога раздачи: блэкджек — фанфары, победа, ничья (возврат) или проигрыш. */
  function bjResult(rd: BjRound, delay: number) {
    const o = rd.table.outcomes ?? []; const pay = Number(rd.payout);
    const stake = Number(rd.table.base) * rd.table.hands.reduce((s, h) => s + h.bet, 0);
    setTimeout(() => (o.includes("blackjack") ? sfx("bigwin") : pay > stake ? sfx("win") : pay > 0 ? sfx("coin") : sfx("lose")), delay);
  }
  async function move(action: "hit" | "stand" | "double" | "split") {
    fresh.current = false;
    const r = await run<Res>("/api/blackjack/move", { action });
    if (!r) return;
    if (action === "split") { sfx("chip"); sfx("card", { delay: 150 }); sfx("card", { delay: 350 }); }
    else if (action === "double") { sfx("chip"); sfx("card", { delay: 150 }); }
    else if (action === "hit") sfx("card");
    setRound(r.round);
    if (r.round.status !== "ACTIVE") {
      setVersion((v) => v + 1);
      // карты, которые добрал дилер, «прилетают» по очереди
      const extra = Math.max(0, r.round.table.dealer.length - 2);
      for (let i = 0; i < extra; i++) sfx("card", { delay: 350 + i * 500 });
      bjResult(r.round, extra * 500 + 700);
    }
  }
  // Задержка появления карты: при раздаче — по очереди игрок/дилер, добор дилера — с паузой
  const pDelay = (i: number) => (fresh.current && i < 2 ? i * 0.4 : 0);
  const dDelay = (i: number) => (fresh.current && i < 2 ? 0.2 + i * 0.4 : i >= 2 ? (i - 2) * 0.5 + 0.35 : 0);
  const resultDelay = t ? (t.dealer.length > 2 ? (t.dealer.length - 2) * 0.5 + 0.6 : fresh.current ? 1.4 : 0.5) : 0;

  const btn = "flex h-12 flex-col items-center justify-center rounded-xl font-semibold leading-tight text-white transition-[filter] hover:brightness-110 disabled:opacity-40";
  const controls = (
    <>
      <BetAmount value={active ? (Number(base) / 100).toString() : amount} onChange={setAmount} cfg={cfg} disabled={busy || active} />
      {active && t ? (
        <div className="grid grid-cols-2 gap-2" data-testid="bj-actions">
          <button type="button" onClick={() => move("hit")} disabled={busy || !t.allowed.hit} className={`${btn} bg-[linear-gradient(180deg,#5ef0a6,#1f9d55)]`}>Ещё карту</button>
          <button type="button" onClick={() => move("stand")} disabled={busy || !t.allowed.stand} className={`${btn} bg-[linear-gradient(180deg,#ff8aa0,#e11d48)]`}>Хватит</button>
          <button type="button" onClick={() => move("double")} disabled={busy || !t.allowed.double || !canPay} className={`${btn} bg-[linear-gradient(180deg,#ffd166,#d48a00)]`}>Удвоить<span className="text-[11px] font-normal opacity-85">+{points(base)}</span></button>
          <button type="button" onClick={() => move("split")} disabled={busy || !t.allowed.split || !canPay} className={`${btn} bg-[linear-gradient(180deg,#8fb4ff,#3b5bdb)]`}>Разделить<span className="text-[11px] font-normal opacity-85">+{points(base)}</span></button>
        </div>
      ) : null}
      <ErrorLine text={error} />
      {!active && <PlayButton onClick={deal} loading={busy} disabled={!cfg.enabled || !!betError(amount, cfg, balance)}>{cfg.enabled ? "Раздать" : "Игра отключена"}</PlayButton>}
      <ul className="grid gap-1 rounded-xl bg-ink p-3 text-[12.5px] text-muted">
        <li>Блэкджек платит <b className="text-soft">3:2</b>, дилер стоит на 17.</li>
        <li>Удвоить — ставка ×2 и ровно одна карта.</li>
        <li>Разделить — пару на две руки, каждая со своей ставкой.</li>
      </ul>
    </>
  );

  const stage = (
    <div className="relative grid min-h-[440px] grid-rows-[auto_1fr_auto] gap-3 overflow-hidden p-4 sm:p-6">
      {/* Стол: сукно с золотой надписью */}
      <div aria-hidden className="pointer-events-none absolute inset-3 rounded-[40px_40px_160px_160px] bg-[radial-gradient(120%_90%_at_50%_0%,#1f6b45,#0d3a26_70%)] ring-2 ring-gold/30" />
      <div className="relative flex flex-col items-center gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Дилер {t && <span className="ml-1 rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-white" data-testid="bj-dealer">{t.hidden ? `${totalLabel(t.dealerTotal, 1)} + ?` : totalLabel(t.dealerTotal, t.dealer.length)}</span>}</p>
        <div className="flex min-h-[clamp(76px,21vw,118px)] -space-x-[clamp(18px,5vw,28px)]">
          {t && [...t.dealer, ...(t.hidden ? [null] : [])].map((c, i) => <PlayingCard key={`${round!.id}-d${i}`} card={c} hidden={!c} delay={dDelay(i)} />)}
        </div>
      </div>
      <div className="relative grid place-items-center">
        <p className="rounded-full border border-gold/40 px-4 py-1 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-gold/80">Блэкджек платит 3:2 · дилер стоит на 17</p>
      </div>
      <div className="relative flex flex-wrap items-end justify-center gap-6">
        {t ? t.hands.map((h, hi) => {
          const out = t.outcomes?.[hi]; const on = active && hi === t.active && t.hands.length > 1;
          return (
            <div key={hi} className={`flex flex-col items-center gap-2 rounded-2xl p-2 transition-colors ${on ? "bg-white/10 ring-2 ring-gold/70" : ""}`} data-testid="bj-hand">
              <div className="flex -space-x-[clamp(18px,5vw,28px)]">
                {h.cards.map((c, i) => <PlayingCard key={`${round!.id}-h${hi}-${i}`} card={c} delay={pDelay(i)} from={{ x: 0, y: -160 }} />)}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-black/50 px-2 py-0.5 font-mono text-[14px] font-bold text-white" data-testid="bj-total">{totalLabel(h.total, h.cards.length)}</span>
                {h.doubled && <span className="rounded-md bg-gold/20 px-1.5 py-0.5 text-[11px] font-bold text-gold">×2</span>}
                <AnimatePresence>
                  {out && <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: resultDelay, type: "spring" }} className="rounded-md px-2 py-0.5 text-[12px] font-bold text-ink" style={{ background: OUT[out][1] }}>
                    {out === "lose" && h.total.total > 21 ? "Перебор" : OUT[out][0]}
                  </motion.span>}
                </AnimatePresence>
              </div>
            </div>
          );
        }) : <p className="pb-10 text-center text-white/70">Сделай ставку и нажми «Раздать»</p>}
      </div>
      <AnimatePresence>
        {round && !active && BigInt(round.payout) > 0n && (
          <motion.div key={round.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: resultDelay + 0.2 }}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-black/70 px-5 py-2 text-center ring-1 ring-gold/50">
            <p className="font-display text-[22px] font-bold text-gold">+{points(round.payout)}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return <GameLayout slug="blackjack" controls={controls} stage={stage} footer={<RoundsPanel slug="blackjack" version={version} describe={describe} />} />;
}
