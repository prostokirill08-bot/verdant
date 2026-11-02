"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { minesMultiplier, MINES_TILES } from "@/lib/fair/outcomes";
import { points } from "@/lib/format";
import { api } from "@/lib/api";
import { BetAmount, betError, ErrorLine, GameLayout, Label, newKey, PlayButton, RoundsPanel, Stat, useGameRequest, type GameConfig, type RoundView } from "./kit";

type MinesRound = RoundView & { current: number; next: number | null };
type Res = { round: MinesRound; balance: string };
const describe = (r: RoundView) => { const p = r.params as { mines: number }; const s = r.state as { revealed?: number[]; hit?: number }; return `${p.mines} мин · открыто ${s.revealed?.length ?? 0}${s.hit !== undefined ? " · подрыв" : ""}`; };

export function MinesGame({ cfg }: { cfg: GameConfig }) {
  const { balance, user } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("10");
  const [mines, setMines] = useState(3);
  const [round, setRound] = useState<MinesRound | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  // Незавершённый раунд восстанавливается после перезагрузки страницы
  useEffect(() => {
    if (!user) return;
    api<{ round: MinesRound | null }>("/api/mines/active").then((r) => { if (r.round) { setRound(r.round); setMines((r.round.params as { mines: number }).mines); } }).catch(() => {});
  }, [user]);

  const active = round?.status === "ACTIVE";
  const revealed = new Set<number>(((round?.state as { revealed?: number[] })?.revealed) ?? []);
  const layout = new Set<number>(!active ? ((round?.result as { mines?: number[] } | null)?.mines ?? []) : []);
  const hitTile = (round?.result as { hit?: number } | null)?.hit;

  async function start() {
    const r = await run<Res>("/api/mines/start", { amount, mines, key: newKey() });
    if (r) setRound(r.round);
  }
  async function reveal(tile: number) {
    if (!active || revealed.has(tile) || pending !== null) return;
    setPending(tile);
    const r = await run<Res>("/api/mines/reveal", { tile });
    setPending(null);
    if (r) { setRound(r.round); if (r.round.status !== "ACTIVE") setVersion((v) => v + 1); }
  }
  async function cashout() {
    const r = await run<Res>("/api/mines/cashout", {});
    if (r) { setRound(r.round); setVersion((v) => v + 1); }
  }
  function randomTile() {
    const free = Array.from({ length: MINES_TILES }, (_, i) => i).filter((i) => !revealed.has(i));
    const i = free[Math.floor(Math.random() * free.length)];
    if (i !== undefined) void reveal(i);
  }

  const bet = active ? BigInt(round!.bet) : 0n;
  const curMult = active ? round!.current : 1;
  const cashValue = (bet * BigInt(Math.round(curMult * 10000))) / 10000n;
  const preview = minesMultiplier(mines, 1, cfg.edgeBp);

  const controls = (
    <>
      <BetAmount value={active ? (Number(round!.bet) / 100).toString() : amount} onChange={setAmount} cfg={cfg} disabled={busy || active} />
      <div>
        <Label aside={<span className="text-soft">{MINES_TILES - mines} безопасных</span>}>Мин на поле</Label>
        <select value={mines} onChange={(e) => setMines(Number(e.target.value))} disabled={busy || active} aria-label="Количество мин"
          className="h-11 w-full rounded-xl border border-line bg-ink px-3 font-mono outline-none focus:border-accent disabled:opacity-60">
          {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {active ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Текущий" value={`${curMult.toFixed(4)}×`} tone="accent" />
          <Stat label="Следующий" value={round!.next ? `${round!.next.toFixed(4)}×` : "—"} />
        </div>
      ) : <Stat label="Первая клетка" value={`${preview.toFixed(4)}×`} />}
      <ErrorLine text={error} />
      {active ? (
        <div className="grid gap-2">
          <PlayButton onClick={cashout} loading={busy && pending === null} disabled={revealed.size === 0 || pending !== null}>Забрать {points(cashValue)}</PlayButton>
          <button type="button" onClick={randomTile} disabled={pending !== null} className="h-10 rounded-xl bg-raised text-[14px] font-semibold text-soft hover:text-white disabled:opacity-50">Случайная клетка</button>
        </div>
      ) : (
        <PlayButton onClick={start} loading={busy} disabled={!cfg.enabled || !!betError(amount, cfg, balance)}>{cfg.enabled ? "Начать раунд" : "Игра отключена"}</PlayButton>
      )}
    </>
  );

  const finished = round && !active;
  const stage = (
    <div className="relative grid min-h-[360px] place-items-center p-4 sm:p-8">
      <div className="grid w-full max-w-[460px] grid-cols-5 gap-2 sm:gap-2.5">
        {Array.from({ length: MINES_TILES }, (_, i) => {
          const isMine = layout.has(i); const open = revealed.has(i) || (finished && isMine) || hitTile === i;
          const gem = revealed.has(i);
          return (
            <motion.button key={`${round?.id ?? "x"}-${i}`} type="button" onClick={() => reveal(i)} disabled={!active || revealed.has(i)}
              whileHover={active && !revealed.has(i) ? { y: -3 } : {}} whileTap={active ? { scale: 0.94 } : {}}
              aria-label={`Клетка ${i + 1}`}
              className={`relative aspect-square rounded-xl transition-colors ${open ? (isMine || hitTile === i ? (hitTile === i ? "bg-danger/25 ring-2 ring-danger" : "bg-ink") : "bg-ink ring-1 ring-accent/40") : finished ? "bg-raised/40" : "bg-raised shadow-[inset_0_-4px_0_rgb(0_0_0/0.25)] hover:bg-[#2f373c]"} ${pending === i ? "animate-pulse" : ""}`}>
              {open && (
                <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 16 }} className="absolute inset-0 grid place-items-center">
                  {gem ? <Gem /> : <Mine dim={hitTile !== i} />}
                </motion.span>
              )}
              {finished && !open && !isMine && <span className="absolute inset-0 grid place-items-center opacity-30"><Gem /></span>}
            </motion.button>
          );
        })}
      </div>
      {finished && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-2xl border border-line bg-panel/95 px-6 py-4 text-center shadow-2xl backdrop-blur">
          {round!.status === "WON"
            ? <><p className="font-display text-[28px] font-bold text-accent">{round!.multiplier.toFixed(2)}×</p><p className="font-mono text-soft">+{points(round!.payout)}</p></>
            : <><p className="font-display text-[22px] font-bold text-danger">Мина!</p><p className="text-[13px] text-muted">Ставка сгорела</p></>}
        </motion.div>
      )}
    </div>
  );

  return <GameLayout controls={controls} stage={stage} footer={<RoundsPanel slug="mines" version={version} describe={describe} />} />;
}

const Gem = () => (
  <svg viewBox="0 0 24 24" className="size-[58%]" aria-hidden>
    <path d="M7 3h10l4 6-9 12L3 9z" fill="#00c47a" /><path d="M7 3l5 6 5-6M3 9h18M12 9v12" stroke="#04150d" strokeOpacity=".35" strokeWidth="1.2" fill="none" />
  </svg>
);
const Mine = ({ dim }: { dim?: boolean }) => (
  <svg viewBox="0 0 24 24" className={`size-[58%] ${dim ? "opacity-60" : ""}`} aria-hidden>
    <circle cx="12" cy="13" r="7" fill="#ff5a5f" /><path d="M12 2v4M12 20v2M2 13h3M19 13h3M5 6l2 2M19 6l-2 2" stroke="#ff5a5f" strokeWidth="2" strokeLinecap="round" /><circle cx="9.5" cy="10.5" r="1.8" fill="#fff" fillOpacity=".7" />
  </svg>
);
