"use client";
import { sfx } from "@/lib/sound";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { anticipationFrom, NEON, type NeonCell, type NeonResult, type NeonSpin } from "@/lib/fair/slots";
import { ErrorLine, newKey, parsePoints, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "../kit";
import { BonusLabel, BonusTotal, DryCounter, InfoModal, Reels, SlotControls, sleep, useDrySpins, useSlotState, WinOverlay, winCells, winUnits, type BonusState, type LineWin } from "./SlotKit";

const SYMS = ["cherry", "lemon", "plum", "watermelon", "strawberry", "seven", "joker"];
const NAMES: Record<string, string> = { cherry: "Вишня", lemon: "Лимон", plum: "Слива", watermelon: "Арбуз", strawberry: "Клубника", seven: "Семёрка", joker: "Эльф", bonus: "Подарок" };
const randomCell = (): NeonCell => ({ sym: Math.random() < 0.05 ? "bonus" : SYMS[Math.floor(Math.random() * SYMS.length)]! });
// Стартовая раскладка фиксированная — одинаковая на сервере и в браузере
const START: NeonCell[][] = [
  [{ sym: "cherry" }, { sym: "seven" }, { sym: "lemon" }, { sym: "plum" }], [{ sym: "watermelon" }, { sym: "joker" }, { sym: "cherry" }, { sym: "bonus" }],
  [{ sym: "seven" }, { sym: "strawberry" }, { sym: "strawberry" }, { sym: "lemon" }], [{ sym: "plum" }, { sym: "seven" }, { sym: "watermelon" }, { sym: "cherry" }],
  [{ sym: "strawberry" }, { sym: "lemon" }, { sym: "bonus" }, { sym: "seven" }],
];

function Cell({ c }: { c: NeonCell }) {
  // Бонус-символ — подарок с надписью BONUS
  const img = c.sym;
  return (
    <span className="relative block size-full">
      <Image src={`/img/verdant/slots/neon/${img}.webp`} alt={NAMES[c.sym] ?? c.sym} fill sizes="110px" className={`rounded-lg object-cover ${c.sym === "bonus" ? "ring-2 ring-gold/70" : ""}`} draggable={false} />
      {c.sym === "bonus" && <BonusLabel />}
    </span>
  );
}

const describe = (r: RoundView) => {
  const x = r.result as (NeonResult & { feature?: unknown }) | null; if (!x) return "—";
  if (x.fs) return `Бонус: ${x.fs.spins.length} фриспинов${x.bought ? " (куплен)" : ""} · ${x.totalMult}×`;
  if (x.feature) return `Бонус · ${x.totalMult}×`;   // раунды старой версии слота
  return x.totalMult > 0 ? `Выигрыш ${x.totalMult}×` : "Без выигрыша";
};

export function NeonGame({ cfg }: { cfg: GameConfig }) {
  const { setBalance, balance, user } = useAuth();
  const { run, busy: reqBusy, error } = useGameRequest();
  const { bet, setBet, turbo, setTurbo, auto, setAuto } = useSlotState(cfg);
  const [grid, setGrid] = useState<NeonCell[][]>(START);
  const [spinKey, setSpinKey] = useState(0);
  const [slowFrom, setSlowFrom] = useState<number | null>(null);
  const [lines, setLines] = useState<LineWin[]>([]);
  const [hl, setHl] = useState<Set<string> | null>(null);
  const [fs, setFs] = useState<BonusState | null>(null);
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [big, setBig] = useState<{ mult: number; amount: string; label?: string; short?: boolean } | null>(null);
  const { dry, prev, count } = useDrySpins("neon-garden", !!user);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [version, setVersion] = useState(0);
  const stop = useRef<() => void>(() => {});
  const bigDone = useRef<() => void>(() => {});
  const turboRef = useRef(turbo); turboRef.current = turbo;
  const t = (ms: number) => sleep(turboRef.current ? ms / 2 : ms);

  const spinTo = useCallback((g: NeonCell[][]) => new Promise<void>((res) => {
    stop.current = res; setHl(null); setLines([]);
    setSlowFrom(anticipationFrom(g.map((c) => c.map((x) => x.sym)), "bonus"));   // 2 BONUS уже лежат — остальные барабаны тянут интригу
    setGrid(g); setSpinKey((k) => k + 1);
  }), []);
  const showBig = (mult: number, amount: string, label?: string, short = false) => new Promise<void>((res) => { bigDone.current = () => { setBig(null); res(); }; setBig({ mult, amount, label, short }); });

  async function showSpin(s: NeonSpin, units: bigint, inBonus = false) {
    await spinTo(s.grid);
    const cells = winCells(s.wins, NEON.lines);
    if (s.scatter.count >= 3) s.grid.forEach((col, reel) => col.forEach((x, row) => x.sym === "bonus" && cells.add(`${reel}:${row}`)));
    setLines(s.wins); setHl(cells.size ? cells : null);
    if (s.mult > 0 && s.mult < 10) sfx(s.mult >= 3 ? "bigwin" : "win");
    if (s.mult > 0 && !inBonus) setLastWin(winUnits(units, s.mult).toString());   // в бонусе показываем общую сумму
    await t(s.mult > 0 || s.retrigger ? 1000 : 250);
  }

  async function play(buy: boolean): Promise<boolean> {
    const units = parsePoints(bet) ?? 0n;
    setPlaying(true); setLastWin(null); setHl(null); setLines([]);
    const r = await run<{ round: RoundView; balance: string }>("/api/games/neon-garden/bet", { amount: bet, params: { buy }, key: newKey() }, { deferBalance: true });
    if (!r) { setPlaying(false); return false; }
    setBalance((BigInt(balance) - BigInt(r.round.bet)).toString());
    const res = r.round.result as unknown as NeonResult;
    if (res.base) await showSpin(res.base, units);
    if (!res.bought) count(!!res.fs);   // счётчик спинов без бонуса
    if (res.fs) {
      const f = res.fs;
      sfx("bonus"); setBanner(<Intro count={NEON.freeSpins} x={f.x} />); await sleep(2600); setBanner(null);
      // Сумма бонуса считается сразу: выигрыш запускающего спина + каждый бесплатный спин
      const cap = winUnits(units, NEON.maxWin);
      let total = res.base ? winUnits(units, res.base.mult) : 0n; let left = NEON.freeSpins; let tick = 0;
      setFs({ left, done: 0, total: total.toString(), add: null, tick });
      for (let i = 0; i < f.spins.length; i++) {
        const s = f.spins[i]!; left--;
        setFs({ left, done: i + 1, total: total.toString(), add: null, tick });
        await showSpin(s, units, true);
        const add = winUnits(units, s.mult);
        if (add > 0n) { total = total + add > cap ? cap : total + add; tick++; }
        setFs({ left, done: i + 1, total: total.toString(), add: add > 0n ? add.toString() : null, tick });
        setLastWin(total.toString());
        if (s.mult >= 10) await showBig(s.mult, add.toString(), `Бесплатное вращение ${i + 1}`, true);   // крупный выигрыш внутри бонуса
        if (add > 0n) await t(500);
        if (s.retrigger) { sfx("bonus"); left += NEON.freeSpins; setFs({ left, done: i + 1, total: total.toString(), add: null, tick }); setBanner(<p className="font-display text-[28px] font-bold text-gold">+{NEON.freeSpins} ВРАЩЕНИЙ!</p>); await sleep(1500); setBanner(null); }
      }
      setFs({ left: 0, done: f.spins.length, total: r.round.payout, add: null, tick });
      await showBig(res.totalMult, r.round.payout, `Бонус: ${f.spins.length} вращений`);
      setFs(null);
    } else if (res.totalMult >= 10) await showBig(res.totalMult, r.round.payout);
    setLastWin(r.round.payout);
    setBalance(r.balance); setVersion((v) => v + 1); setPlaying(false);
    return true; // автоигра продолжается и после бонуса
  }

  useEffect(() => {
    if (auto <= 0 || playing || reqBusy) return;
    if (user && (parsePoints(bet) ?? 0n) > BigInt(balance)) { setAuto(0); return; }
    const tm = setTimeout(async () => { const cont = await play(false); setAuto((a) => (cont && a > 0 ? a - 1 : 0)); }, 250);
    return () => clearTimeout(tm);
  }, [auto, playing, reqBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = playing || reqBusy;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <div className="relative overflow-hidden rounded-[28px] ring-1 ring-white/10" style={{ boxShadow: "0 30px 80px -40px #5bb8ff" }}>
        <Image src="/img/verdant/bg/neon-garden.webp" alt="" fill priority sizes="100vw" className="object-cover object-[78%_center]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070b1f]/50 via-[#070b1f]/30 to-[#070b1f]/90" />
        <div className="relative mx-auto grid max-w-[720px] gap-3 p-3 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[clamp(22px,4.6vw,34px)] font-bold tracking-wide text-[#bfe6ff] drop-shadow-[0_0_14px_#5bb8ff]">NEON GARDEN</h2>
            <AnimatePresence>{fs && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl bg-black/55 px-3 py-1.5 text-[12px] leading-tight ring-1 ring-gold/50">
                <b className="text-gold">Бесплатно: {fs.left}</b><br /><span className="text-white/70">все выигрыши ×{NEON.fsMultiplier}</span>
              </motion.div>
            )}</AnimatePresence>
          </div>
          <BonusTotal state={fs} color="#8fdcff" />
          <div className="snow-cap relative rounded-2xl bg-[linear-gradient(180deg,#10234a,#070d22)] p-2 shadow-[inset_0_0_0_2px_rgb(143_220_255/0.55),0_20px_50px_-20px_#000] sm:p-3">
            <Reels grid={grid} rows={4} spinKey={spinKey} turbo={turbo || !!fs} filler={randomCell} onStopped={() => stop.current()} slowFrom={slowFrom}
              render={(c) => <Cell c={c} />} highlight={hl} lines={lines} linePatterns={NEON.lines} />
            <AnimatePresence>{banner && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/75 p-3 ">{banner}</motion.div>
            )}</AnimatePresence>
            <WinOverlay show={!!big} mult={big?.mult ?? 0} amount={big?.amount ?? "0"} label={big?.label} short={big?.short} onDone={() => bigDone.current()} />
          </div>
          <DryCounter dry={dry} prev={prev} avg={130} />
          {user ? (
            <SlotControls cfg={cfg} bet={bet} setBet={setBet} busy={busy} onSpin={() => void play(false)} onBuy={() => void play(true)} buyPrice={NEON.buyPrice}
              auto={auto} setAuto={setAuto} turbo={turbo} setTurbo={setTurbo} onInfo={() => setInfo(true)} accent={["#0e7490", "#7dd3fc"]} lastWin={lastWin} />
          ) : <PlayButton onClick={() => {}}>Войти</PlayButton>}
          <ErrorLine text={error} />
        </div>
      </div>
      <RoundsPanel slug="neon-garden" version={version} describe={describe} />
      <InfoModal open={info} onClose={() => setInfo(false)} title="Neon Garden — выплаты">
        <p>25 фиксированных линий, ставка делится на 25. Выплата — за 3–5 одинаковых символов слева направо (числа — во сколько раз больше ставки на линию).</p>
        <div className="grid grid-cols-2 gap-2">
          {(["seven", "strawberry", "watermelon", "plum", "lemon", "cherry"] as const).map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-xl bg-ink p-2">
              <span className="relative size-12 shrink-0"><Cell c={{ sym: s }} /></span>
              <span className="font-mono text-[12px]">{Object.entries(NEON.pays[s]!).reverse().map(([n, v]) => <span key={n} className="block">{n}× — {v}</span>)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3"><span className="relative size-12 shrink-0"><Cell c={{ sym: "joker" }} /></span><p><b>Эльф</b> — дикий символ: появляется на барабанах 2–4 и заменяет любой фрукт и семёрку.</p></div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3">
          <span className="relative size-14 shrink-0"><Cell c={{ sym: "bonus" }} /></span>
          <p><b className="text-gold">Подарок BONUS</b> — 3, 4 или 5 в любом месте платят 2×, 10× или 50× ставки и дают <b>{NEON.freeSpins} бесплатных вращений</b>, где все выигрыши умножаются на ×{NEON.fsMultiplier}. Новые 3 BONUS во время бонуса добавляют ещё {NEON.freeSpins} вращений.</p>
        </div>
        <p>Если на первых барабанах уже лежат 2 BONUS, остальные барабаны подсвечиваются и крутятся дольше — в ожидании третьего. Автоигру можно включить без лимита.</p>
        <p>«Купить бонус» сразу запускает бесплатные вращения за {NEON.buyPrice}× ставки. Максимальный выигрыш — {NEON.maxWin.toLocaleString("ru-RU")}× ставки. Расчётный RTP ≈ 95,8%.</p>
      </InfoModal>
    </div>
  );
}

function Intro({ count, x }: { count: number; x: number }) {
  return (
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="grid place-items-center gap-3 p-4 text-center">
      <p className="font-display text-[clamp(20px,5vw,34px)] font-bold text-gradient">{count} БЕСПЛАТНЫХ ВРАЩЕНИЙ</p>
      <motion.p initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: 0.4, duration: 0.6 }} className="font-display text-[clamp(36px,9vw,64px)] font-bold text-gold drop-shadow-[0_0_24px_rgb(251_191_36/0.8)]">×{x}</motion.p>
      <p className="text-white/80">на все выигрыши</p>
    </motion.div>
  );
}
