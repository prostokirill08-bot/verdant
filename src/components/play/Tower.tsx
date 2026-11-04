"use client";
import { sfx, winSfx } from "@/lib/sound";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { TOWER_FLOORS, TOWER_LEVELS, towerMultiplier, type TowerLevel } from "@/lib/fair/extra";
import { api } from "@/lib/api";
import { points } from "@/lib/format";
import { BetAmount, betError, ErrorLine, GameLayout, Label, newKey, PlayButton, RoundsPanel, Stat, useGameRequest, type GameConfig, type RoundView } from "./kit";

type TowerRound = RoundView & { current: number; next: number | null };
type Res = { round: TowerRound; balance: string };
const describe = (r: RoundView) => { const p = r.params as { level: TowerLevel }; const s = r.state as { revealed?: number[] }; return `${TOWER_LEVELS[p.level].name} · этажей ${r.status === "LOST" ? (s.revealed?.length ?? 1) - 1 : s.revealed?.length ?? 0}`; };

export function TowerGame({ cfg }: { cfg: GameConfig }) {
  const { balance, user } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [amount, setAmount] = useState("10");
  const [level, setLevel] = useState<TowerLevel>("medium");
  const [round, setRound] = useState<TowerRound | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user) return;
    api<{ round: TowerRound | null }>("/api/tower/active").then((r) => { if (r.round) { setRound(r.round); setLevel((r.round.params as { level: TowerLevel }).level); } }).catch(() => {});
  }, [user]);

  const active = round?.status === "ACTIVE";
  const shownLevel = round ? (round.params as { level: TowerLevel }).level : level;
  const lv = TOWER_LEVELS[shownLevel];
  const picked = ((round?.state as { revealed?: number[] })?.revealed) ?? [];
  const traps = (round?.result as { traps?: number[][] } | null)?.traps;
  const hit = (round?.result as { hit?: { floor: number; tile: number } } | null)?.hit;
  const floorNow = active ? picked.length : -1;

  async function start() { const r = await run<Res>("/api/tower/start", { amount, level, key: newKey() }); if (r) setRound(r.round); }
  async function pick(tile: number) {
    const r = await run<Res>("/api/tower/pick", { tile });
    if (!r) return;
    const st = r.round.status;
    if (st === "LOST") sfx("boom"); else { sfx("gem", { pitch: 1 + (r.round.multiplier > 1 ? Math.log2(r.round.multiplier) * 0.15 : 0) }); if (st === "WON") { sfx("cashout", { delay: 150 }); winSfx(r.round.multiplier, 350); } }
    setRound(r.round); if (st !== "ACTIVE") setVersion((v) => v + 1);
  }
  async function cashout() { const r = await run<Res>("/api/tower/cashout", {}); if (r) { sfx("cashout"); winSfx(r.round.multiplier, 200); setRound(r.round); setVersion((v) => v + 1); } }

  const bet = active ? BigInt(round!.bet) : 0n;
  const controls = (
    <>
      <BetAmount value={active ? (Number(round!.bet) / 100).toString() : amount} onChange={setAmount} cfg={cfg} disabled={busy || active} />
      <div>
        <Label>Сложность</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(TOWER_LEVELS) as TowerLevel[]).map((k) => (
            <button key={k} type="button" onClick={() => { setLevel(k); if (!active) setRound(null); }} disabled={busy || active} aria-pressed={level === k}
              className={`h-10 rounded-xl text-[13px] font-semibold disabled:opacity-60 ${level === k ? "bg-[linear-gradient(180deg,#fcd34d,#d97706)] text-ink" : "bg-ink text-soft ring-1 ring-line hover:text-white"}`}>
              {TOWER_LEVELS[k].name} <span className="opacity-70">{TOWER_LEVELS[k].tiles - TOWER_LEVELS[k].traps}/{TOWER_LEVELS[k].tiles}</span>
            </button>
          ))}
        </div>
      </div>
      {active ? (
        <div className="grid grid-cols-2 gap-2"><Stat label="Сейчас" value={`${round!.current.toFixed(2)}×`} tone="accent" /><Stat label="Следующий этаж" value={round!.next ? `${round!.next.toFixed(2)}×` : "—"} /></div>
      ) : <Stat label="Вершина башни" value={`${towerMultiplier(level, TOWER_FLOORS, cfg.edgeBp).toLocaleString("ru-RU")}×`} tone="accent" />}
      <ErrorLine text={error} />
      {active
        ? <PlayButton onClick={cashout} loading={busy} disabled={!picked.length}>Забрать {points((bet * BigInt(Math.round(round!.current * 10000))) / 10000n)}</PlayButton>
        : <PlayButton onClick={start} loading={busy} disabled={!cfg.enabled || !!betError(amount, cfg, balance)}>{cfg.enabled ? "Начать подъём" : "Игра отключена"}</PlayButton>}
    </>
  );

  const stage = (
    <div className="grid gap-1.5 p-4 sm:p-6">
      {Array.from({ length: TOWER_FLOORS }, (_, k) => {
        const floor = TOWER_FLOORS - 1 - k; const mult = towerMultiplier(shownLevel, floor + 1, cfg.edgeBp);
        const isNow = floor === floorNow; const passed = floor < picked.length && !(hit && hit.floor === floor);
        return (
          <div key={floor} className={`grid grid-cols-[64px_1fr] items-center gap-2 rounded-2xl p-1.5 transition-colors ${isNow ? "bg-gold/10 ring-1 ring-gold/50" : ""}`}>
            <span className={`text-right font-mono text-[12.5px] font-bold ${passed ? "text-accent" : isNow ? "text-gold" : "text-muted"}`}>{mult >= 100 ? mult.toFixed(0) : mult.toFixed(2)}×</span>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${lv.tiles}, minmax(0, 1fr))` }}>
              {Array.from({ length: lv.tiles }, (_, tile) => {
                const chosen = picked[floor] === tile; const trap = traps?.[floor]?.includes(tile); const boom = hit?.floor === floor && hit.tile === tile;
                const reveal = !active && traps;
                return (
                  <motion.button key={tile} type="button" onClick={() => pick(tile)} disabled={!isNow || busy}
                    whileHover={isNow ? { y: -2 } : {}} whileTap={isNow ? { scale: 0.95 } : {}}
                    className={`grid h-10 place-items-center rounded-xl text-[18px] transition-colors sm:h-11 ${boom ? "bg-danger/40 ring-2 ring-danger" : chosen ? "bg-accent/25 ring-1 ring-accent/60" : reveal && trap ? "bg-danger/15" : isNow ? "bg-[linear-gradient(180deg,#f3f8ff_0_16%,#7fb6e6_17%,#3c6fa8)] ring-1 ring-gold/60 hover:brightness-110" : "bg-[linear-gradient(180deg,rgb(255_255_255/0.5)_0_10%,rgb(143_220_255/0.12)_11%,rgb(143_220_255/0.06))] ring-1 ring-white/5"}`}>
                    {boom ? "💥" : chosen ? "🎁" : reveal && trap ? <span className="opacity-70">☃️</span> : reveal ? <span className="opacity-30">🎁</span> : ""}
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}
      {round && !active && (
        <p className={`mt-2 text-center font-display text-[20px] font-bold ${round.status === "WON" ? "text-gold" : "text-danger"}`}>
          {round.status === "WON" ? `${round.multiplier.toFixed(2)}× · +${points(round.payout)}` : "Ловушка! Раунд завершён"}
        </p>
      )}
    </div>
  );

  return <GameLayout slug="tower" controls={controls} stage={stage} footer={<RoundsPanel slug="tower" version={version} describe={describe} />} />;
}
