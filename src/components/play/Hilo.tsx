"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { RANK_LABEL } from "@/lib/fair/extra";
import { api } from "@/lib/api";
import { points } from "@/lib/format";
import { BetAmount, betError, ErrorLine, GameLayout, newKey, PlayButton, RoundsPanel, Stat, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Step = { i: number; rank: number; suit: number; guess: "start" | "higher" | "lower" | "skip"; ok: boolean; mult: number };
type HiloRound = RoundView & { current: number; odds: { higher: number; lower: number; higherMult: number; lowerMult: number }; skipsLeft: number };
type Res = { round: HiloRound; balance: string };
const SUITS = ["♠", "♥", "♦", "♣"];
const describe = (r: RoundView) => { const s = r.state as { revealed?: Step[] }; const n = (s.revealed ?? []).filter((x) => x.guess === "higher" || x.guess === "lower").length; return `Ходов: ${n}`; };

export function Card({ rank, suit, size = "lg" }: { rank: number; suit: number; size?: "lg" | "sm" }) {
  const red = suit === 1 || suit === 2; const lg = size === "lg";
  return (
    <div className={`relative grid place-items-center rounded-2xl bg-[linear-gradient(160deg,#ffffff,#eef5ff)] shadow-[0_18px_40px_-14px_rgb(0_0_0/0.7)] ${lg ? "h-[190px] w-[136px]" : "h-14 w-10 rounded-lg"} ${red ? "text-[#e11d48]" : "text-[#1e1b4b]"}`}>
      {/* Веточка остролиста в углу карты */}
      {lg && <span aria-hidden className="absolute right-2 top-2 text-[18px]">🌿</span>}
      <span className={`absolute left-2 top-1.5 font-display font-bold leading-none ${lg ? "text-[22px]" : "text-[12px] left-1 top-1"}`}>{RANK_LABEL[rank]}<br />{SUITS[suit]}</span>
      <span className={lg ? "text-[64px]" : "text-[18px]"}>{SUITS[suit]}</span>
      {lg && <span className="absolute bottom-1.5 right-2 rotate-180 font-display text-[22px] font-bold leading-none">{RANK_LABEL[rank]}<br />{SUITS[suit]}</span>}
    </div>
  );
}

export function HiloGame({ cfg }: { cfg: GameConfig }) {
  const { balance, user } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("10");
  const [round, setRound] = useState<HiloRound | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user) return;
    api<{ round: HiloRound | null }>("/api/hilo/active").then((r) => r.round && setRound(r.round)).catch(() => {});
  }, [user]);

  const active = round?.status === "ACTIVE";
  const cards = ((round?.state as { revealed?: Step[] })?.revealed) ?? (round?.result as { cards?: Step[] } | null)?.cards ?? [];
  const cur = cards[cards.length - 1];

  async function start() { const r = await run<Res>("/api/hilo/start", { amount, key: newKey() }); if (r) setRound(r.round); }
  async function guess(g: "higher" | "lower" | "skip") { const r = await run<Res>("/api/hilo/guess", { guess: g }); if (r) { setRound(r.round); if (r.round.status !== "ACTIVE") setVersion((v) => v + 1); } }
  async function cashout() { const r = await run<Res>("/api/hilo/cashout", {}); if (r) { setRound(r.round); setVersion((v) => v + 1); } }

  const bet = active ? BigInt(round!.bet) : 0n;
  const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
  const controls = (
    <>
      <BetAmount value={active ? (Number(round!.bet) / 100).toString() : amount} onChange={setAmount} cfg={cfg} disabled={busy || active} />
      {active && cur ? (
        <>
          <div className="grid gap-2">
            <button type="button" onClick={() => guess("higher")} disabled={busy} className="flex h-12 items-center justify-between rounded-xl bg-[linear-gradient(180deg,#5ef0a6,#1f9d55)] px-4 font-semibold text-white disabled:opacity-50">
              <span>▲ {cur.rank === 13 ? "Король" : "Выше или равно"}</span><span className="font-mono text-[13px]">{pct(round!.odds.higher)} · {round!.odds.higherMult.toFixed(2)}×</span>
            </button>
            <button type="button" onClick={() => guess("lower")} disabled={busy} className="flex h-12 items-center justify-between rounded-xl bg-[linear-gradient(180deg,#ff8aa0,#e11d48)] px-4 font-semibold text-white disabled:opacity-50">
              <span>▼ {cur.rank === 1 ? "Туз" : "Ниже или равно"}</span><span className="font-mono text-[13px]">{pct(round!.odds.lower)} · {round!.odds.lowerMult.toFixed(2)}×</span>
            </button>
            <button type="button" onClick={() => guess("skip")} disabled={busy || round!.skipsLeft <= 0} className="h-10 rounded-xl bg-raised text-[13px] font-semibold text-soft hover:text-white disabled:opacity-40">Пропустить карту ({round!.skipsLeft})</button>
          </div>
          <Stat label="Текущий множитель" value={`${round!.current.toFixed(2)}×`} tone="accent" />
        </>
      ) : null}
      <ErrorLine text={error} />
      {active
        ? <PlayButton onClick={cashout} loading={busy} disabled={round!.current <= 1} variant="secondary">Забрать {points((bet * BigInt(Math.round(round!.current * 10000))) / 10000n)}</PlayButton>
        : <PlayButton onClick={start} loading={busy} disabled={!cfg.enabled || !!betError(amount, cfg, balance)}>{cfg.enabled ? "Раздать карту" : "Игра отключена"}</PlayButton>}
    </>
  );

  const stage = (
    <div className="grid min-h-[400px] place-items-center gap-5 p-5">
      <div className="relative flex items-center gap-6">
        <div className="hidden h-[190px] w-[136px] place-items-center rounded-2xl bg-[repeating-linear-gradient(45deg,#b5122f_0_10px,#8a0d24_10px_20px)] text-[48px] ring-2 ring-gold/60 sm:grid" aria-hidden>❄️</div>
        <AnimatePresence mode="popLayout">
          {cur ? (
            <motion.div key={cur.i} initial={{ rotateY: 90, x: -40 }} animate={{ rotateY: 0, x: 0 }} transition={{ duration: 0.35 }}>
              <Card rank={cur.rank} suit={cur.suit} />
            </motion.div>
          ) : <div className="grid h-[190px] w-[136px] place-items-center rounded-2xl border-2 border-dashed border-line text-muted">?</div>}
        </AnimatePresence>
      </div>
      {round && !active && (
        <p className={`font-display text-[22px] font-bold ${round.status === "WON" ? "text-gold" : "text-danger"}`}>{round.status === "WON" ? `${round.multiplier.toFixed(2)}× · +${points(round.payout)}` : "Не угадал"}</p>
      )}
      <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
        {cards.map((c) => (
          <div key={c.i} className={`relative shrink-0 rounded-lg ${c.guess === "start" || c.guess === "skip" ? "opacity-70" : c.ok ? "ring-2 ring-accent" : "ring-2 ring-danger"}`}>
            <Card rank={c.rank} suit={c.suit} size="sm" />
            {c.guess !== "start" && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded bg-ink px-1 text-[9px] font-bold text-soft">{c.guess === "higher" ? "▲" : c.guess === "lower" ? "▼" : "→"}</span>}
          </div>
        ))}
      </div>
    </div>
  );

  return <GameLayout slug="hilo" controls={controls} stage={stage} footer={<RoundsPanel slug="hilo" version={version} describe={describe} />} />;
}
