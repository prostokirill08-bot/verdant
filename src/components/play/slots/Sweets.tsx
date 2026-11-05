"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { SWT, type SwtResult, type SwtSpin } from "@/lib/fair/slots3";
import { sfx } from "@/lib/sound";
import { ErrorLine, newKey, parsePoints, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "../kit";
import { BonusTotal, DryCounter, InfoModal, SlotControls, sleep, useDrySpins, useSlotState, WinOverlay, winUnits, type BonusState } from "./SlotKit";

const NAMES: Record<string, string> = {
  heart: "Пряничное сердце", ginger: "Пряничный человечек", cane: "Леденцовая трость", cupcake: "Капкейк",
  drop_red: "Засахаренная вишня", drop_purple: "Фиолетовый мармелад", drop_green: "Зелёный мармелад", drop_blue: "Голубой мармелад", scatter: "Леденец BONUS",
};
const R = SWT.reels, ROWS = SWT.rows;
const START: string[][] = [
  ["drop_blue", "cane", "drop_green", "heart", "drop_red", "cupcake", "drop_purple"], ["ginger", "drop_purple", "scatter", "drop_blue", "cupcake", "drop_green", "cane"],
  ["drop_green", "cupcake", "drop_red", "drop_blue", "ginger", "drop_purple", "drop_red"], ["heart", "drop_blue", "cane", "drop_purple", "drop_green", "scatter", "ginger"],
  ["drop_red", "ginger", "drop_blue", "cupcake", "drop_purple", "drop_green", "heart"], ["cupcake", "drop_green", "heart", "drop_red", "cane", "drop_blue", "drop_purple"],
  ["drop_purple", "drop_red", "ginger", "drop_green", "drop_blue", "cane", "cupcake"],
];
type Cell = { id: number; sym: string; reel: number; row: number; fresh: boolean; delay: number };
let seq = 0;
const fromGrid = (g: string[][], drop = true): Cell[] => g.flatMap((col, reel) => col.map((sym, row) => ({ id: ++seq, sym, reel, row, fresh: drop, delay: reel * 0.05 + (ROWS - row) * 0.03 })));

export function SwtSym({ s, big }: { s: string; big?: boolean }) {
  return (
    <>
      <Image src={`/img/ny/slots/sweets/${s}.webp`} alt={NAMES[s] ?? s} fill sizes="80px" className={`rounded-lg object-cover ${s === "scatter" ? "ring-2 ring-[#ff8ad8]" : ""}`} draggable={false} />
      {s === "scatter" && !big && <span className="pointer-events-none absolute inset-x-0 bottom-[4%] mx-auto w-fit rounded bg-[linear-gradient(180deg,#fde68a,#f59e0b)] px-1 font-display text-[clamp(6px,1.7vw,10px)] font-bold leading-tight tracking-wide text-[#3a2300]">BONUS</span>}
    </>
  );
}

const describe = (r: RoundView) => { const x = r.result as SwtResult | null; if (!x) return "—"; return x.fs ? `Бонус: ${x.fs.spins.length} вращений${x.bought ? " (куплен)" : ""}` : x.base && x.base.mult > 0 ? `Выигрыш ${x.totalMult}× · взрывов ${x.base.steps.length - 1}` : "Без выигрыша"; };

/** Поле 7×7: под символами — клетки-множители (отмеченные светятся, на множителях — золотая плашка ×N). */
function SweetGrid({ cells, hot, pops, spots }: { cells: Cell[]; hot: Set<string>; pops: { key: number; reel: number; row: number }[]; spots: Record<string, number> }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl" data-testid="swt-grid">
      {/* Клетки-множители */}
      {Object.entries(spots).map(([k, v]) => {
        const [reel, row] = k.split(":").map(Number);
        return (
          <div key={k} className="pointer-events-none absolute p-[2%]" style={{ left: `${(reel! * 100) / R}%`, top: `${(row! * 100) / ROWS}%`, width: `${100 / R}%`, height: `${100 / ROWS}%` }}>
            <motion.div key={v} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`size-full rounded-lg ${v >= 2 ? "bg-[radial-gradient(circle,#ffd16688,#ff8ad855)] ring-2 ring-[#ffd166]" : "bg-[#ff8ad8]/25 ring-1 ring-[#ff8ad8]/60"}`} />
          </div>
        );
      })}
      <AnimatePresence>
        {cells.map((c) => {
          const isHot = hot.has(`${c.reel}:${c.row}`);
          return (
            <motion.div key={c.id} layout="position"
              initial={c.fresh ? { y: "-700%", opacity: 0.4 } : false} animate={{ y: 0, opacity: 1, scale: isHot ? [1, 1.14, 1] : 1 }}
              exit={{ scale: 1.5, opacity: 0, rotate: -14, transition: { duration: 0.26 } }}
              transition={{ y: { duration: 0.4, delay: c.fresh ? c.delay : 0, ease: [0.3, 0.9, 0.4, 1.08] }, layout: { duration: 0.33, ease: [0.3, 0.9, 0.4, 1.08] }, scale: { duration: 0.5, repeat: isHot ? Infinity : 0 } }}
              className="absolute p-[2.5%]" style={{ left: `${(c.reel * 100) / R}%`, top: `${(c.row * 100) / ROWS}%`, width: `${100 / R}%`, height: `${100 / ROWS}%` }}>
              <div className={`relative size-full rounded-lg ${isHot ? "shadow-[0_0_18px_#ff8ad8] ring-2 ring-white" : ""}`}><SwtSym s={c.sym} /></div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {/* Плашки множителей поверх символов */}
      {Object.entries(spots).filter(([, v]) => v >= 2).map(([k, v]) => {
        const [reel, row] = k.split(":").map(Number);
        return (
          <motion.span key={`${k}-${v}`} initial={{ scale: 1.8 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 12 }}
            className="pointer-events-none absolute z-10 rounded-md bg-[linear-gradient(180deg,#fff3b0,#f59e0b)] px-1 font-display text-[clamp(8px,2vw,12px)] font-bold leading-tight text-[#4a1d00] shadow-[0_0_10px_#ffd166]"
            style={{ left: `calc(${(reel! * 100) / R}% + 2px)`, top: `calc(${(row! * 100) / ROWS}% + 2px)` }} data-testid="swt-spot">×{v}</motion.span>
        );
      })}
      {/* Сахарные брызги на месте лопнувших конфет */}
      {pops.map((s) => (
        <div key={s.key} className="pointer-events-none absolute" style={{ left: `${((s.reel + 0.5) * 100) / R}%`, top: `${((s.row + 0.5) * 100) / ROWS}%` }}>
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2 + s.key; const c = ["#ff8ad8", "#ffd166", "#8fdcff", "#7cf5b6"][i % 4];
            return <motion.span key={i} initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: Math.cos(a) * 34, y: Math.sin(a) * 34 + 20, opacity: 0, scale: 0.4 }} transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute size-2 rounded-full" style={{ background: c }} />;
          })}
        </div>
      ))}
    </div>
  );
}

export function SweetsGame({ cfg }: { cfg: GameConfig }) {
  const { setBalance, balance, user } = useAuth();
  const { run, busy: reqBusy, error } = useGameRequest();
  const { bet, setBet, turbo, setTurbo, auto, setAuto } = useSlotState(cfg);
  const [cells, setCells] = useState<Cell[]>(() => fromGrid(START, false));
  const [hot, setHot] = useState<Set<string>>(new Set());
  const [pops, setPops] = useState<{ key: number; reel: number; row: number }[]>([]);
  const [spots, setSpots] = useState<Record<string, number>>({});
  const [winText, setWinText] = useState<string | null>(null);
  const [fs, setFs] = useState<BonusState | null>(null);
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [big, setBig] = useState<{ mult: number; amount: string; label?: string; short?: boolean } | null>(null);
  const { dry, prev, count } = useDrySpins("sweets", !!user);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [version, setVersion] = useState(0);
  const bigDone = useRef<() => void>(() => {});
  const turboRef = useRef(turbo); turboRef.current = turbo;
  const t = (ms: number) => sleep(turboRef.current ? ms / 2 : ms);
  const showBig = (mult: number, amount: string, label?: string, short = false) => new Promise<void>((res) => { bigDone.current = () => { setBig(null); res(); }; setBig({ mult, amount, label, short }); });

  /** Одно вращение: конфеты падают, выигрышные кластеры лопаются, клетки под ними отмечаются и удваиваются. */
  async function showSpin(s: SwtSpin, units: bigint, inBonus: boolean, onWin?: (add: bigint) => void) {
    setHot(new Set()); setWinText(null);
    if (!inBonus) setSpots({});
    sfx("whoosh");
    let cur = fromGrid(s.steps[0]!.grid);
    setCells(cur);
    for (let r = 0; r < R; r++) sfx("drop", { i: r, delay: 100 + r * 50 });
    await t(750);
    for (let k = 0; k < s.steps.length; k++) {
      const st = s.steps[k]!;
      if (!st.wins.length) break;
      const gone = new Set(st.wins.flatMap((w) => w.cells));
      setHot(gone);
      const best = [...st.wins].sort((a, b) => b.mult - a.mult)[0]!;
      setWinText(`${NAMES[best.sym]} ×${best.size}${best.x > 1 ? ` · множитель ×${best.x}` : ""}${st.wins.length > 1 ? ` и ещё ${st.wins.length - 1}` : ""}`);
      sfx(st.mult >= 5 ? "bigwin" : "win");
      const add = winUnits(units, st.mult);
      if (!inBonus) setLastWin((p) => (BigInt(p ?? "0") + add).toString()); else onWin?.(add);
      await t(700);
      sfx("pop"); sfx("pop", { delay: 80, pitch: 1.2 });
      setPops([...gone].map((c, i) => { const [reel, row] = c.split(":").map(Number); return { key: Date.now() + i, reel: reel!, row: row! }; }));
      setHot(new Set());
      setSpots(st.spots);
      if (Object.values(st.spots).some((v) => v >= 2)) sfx("chime", { pitch: 1.1, delay: 120 });
      const next = s.steps[k + 1]!.grid;
      const nextCells: Cell[] = [];
      for (let reel = 0; reel < R; reel++) {
        const kept = cur.filter((c) => c.reel === reel && !gone.has(`${c.reel}:${c.row}`)).sort((a, b) => a.row - b.row);
        const fresh = ROWS - kept.length;
        next[reel]!.forEach((sym, row) => {
          if (row < fresh) nextCells.push({ id: ++seq, sym, reel, row, fresh: true, delay: 0.1 + (fresh - row) * 0.045 });
          else { const c = kept[row - fresh]!; nextCells.push({ ...c, row, fresh: false }); }
        });
        if (fresh) sfx("drop", { i: reel, delay: 180 + reel * 35 });
      }
      cur = nextCells; setCells(nextCells);
      await t(720); setPops([]);
    }
    if (s.scatters >= 3) { const sc = new Set<string>(); cur.forEach((c) => c.sym === "scatter" && sc.add(`${c.reel}:${c.row}`)); setHot(sc); sfx("gem"); await t(700); }
    await t(s.mult > 0 ? 350 : 150);
  }

  async function play(buy: boolean): Promise<boolean> {
    const units = parsePoints(bet) ?? 0n;
    setPlaying(true); setLastWin(null); setHot(new Set()); setWinText(null);
    const r = await run<{ round: RoundView; balance: string }>("/api/games/sweets/bet", { amount: bet, params: { buy }, key: newKey() }, { deferBalance: true });
    if (!r) { setPlaying(false); return false; }
    setBalance((BigInt(balance) - BigInt(r.round.bet)).toString());
    const res = r.round.result as unknown as SwtResult;
    if (res.base) await showSpin(res.base, units, false);
    if (!res.bought) count(!!res.fs);
    if (res.fs) {
      const f = res.fs; const spins0 = res.base ? res.base.trigger : SWT.freeSpins[3]!;
      sfx("bonus"); sfx("chime", { delay: 400 }); setBanner(<Intro spins={spins0} />); await sleep(3000); setBanner(null);
      setSpots({});
      let total = res.base ? winUnits(units, res.base.mult) : 0n; let left = spins0; let tick = 0;
      for (let i = 0; i < f.spins.length; i++) {
        const s = f.spins[i]!; left--;
        setFs({ left, done: i + 1, total: total.toString(), add: null, tick });
        await showSpin(s, units, true, (a) => { total += a; tick++; sfx("coin"); setFs({ left, done: i + 1, total: total.toString(), add: a.toString(), tick }); });
        setLastWin(total.toString());
        if (s.mult >= 10) await showBig(s.mult, winUnits(units, s.mult).toString(), `Вращение ${i + 1}`, true);
        if (s.scatters >= 3) { sfx("bonus"); left += SWT.retrigger; setBanner(<motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="font-display text-[28px] font-bold text-[#ffb3e6]">+{SWT.retrigger} ВРАЩЕНИЙ!</motion.p>); await sleep(1400); setBanner(null); }
      }
      const maxSpot = Math.max(1, ...Object.values(f.spins.at(-1)?.steps.at(-1)?.spots ?? {}));
      await showBig(res.totalMult, r.round.payout, `Бонус: ${f.spins.length} вращений · лучший множитель ×${maxSpot}`);
      setFs(null); setSpots({});
    } else if (res.totalMult >= 10) await showBig(res.totalMult, r.round.payout);
    setLastWin(r.round.payout);
    setBalance(r.balance); setVersion((v) => v + 1); setPlaying(false);
    return true;
  }

  useEffect(() => {
    if (auto <= 0 || playing || reqBusy) return;
    if (user && (parsePoints(bet) ?? 0n) > BigInt(balance)) { setAuto(0); return; }
    const tm = setTimeout(async () => { const cont = await play(false); setAuto((a) => (cont && a > 0 ? a - 1 : 0)); }, 250);
    return () => clearTimeout(tm);
  }, [auto, playing, reqBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = playing || reqBusy;
  const spotCount = Object.values(spots).filter((v) => v >= 2).length;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <div className="slot-cabinet relative overflow-hidden rounded-[28px] ring-1 ring-white/10" style={{ boxShadow: "0 30px 80px -40px #ff8ad8" }}><div className="ornate-frame" aria-hidden />
        <Image src="/img/ny/bg/sweets.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#2a0b2e]/45 via-[#120a26]/35 to-[#070b1f]/92" />
        <div className="relative mx-auto grid max-w-[680px] gap-4 p-3 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[clamp(20px,4vw,30px)] font-bold tracking-wide text-[#ffe0f4] drop-shadow-[0_2px_14px_rgb(255_138_216/0.9)]">🍬 СЛАДКИЙ ВЗРЫВ</h2>
            {fs && spotCount > 0 && <span className="rounded-xl bg-black/50 px-3 py-1 text-[13px] font-semibold text-[#ffd166] ring-1 ring-[#ffd166]/50">множителей: {spotCount}</span>}
          </div>
          <BonusTotal state={fs} color="#ff8ad8" title="🍬 Сладкий бонус" sub={fs ? "Клетки-множители остаются до конца бонуса и удваиваются" : undefined} />
          <div className="snow-cap relative rounded-2xl bg-[linear-gradient(180deg,#5a1b5e,#2a0b3a)] p-2 shadow-[inset_0_0_0_2px_rgb(255_179_230/0.6),0_20px_50px_-20px_#000] sm:p-3">
            <SweetGrid cells={cells} hot={hot} pops={pops} spots={spots} />
            <AnimatePresence>{winText && (
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-0 -bottom-1 z-20 mx-auto w-fit rounded-full bg-black/75 px-3 py-1 text-[12.5px] font-semibold text-[#ffe0f4] ring-1 ring-[#ff8ad8]/40">{winText}</motion.p>
            )}</AnimatePresence>
            <AnimatePresence>{banner && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center rounded-2xl bg-black/75">{banner}</motion.div>
            )}</AnimatePresence>
            <WinOverlay show={!!big} mult={big?.mult ?? 0} amount={big?.amount ?? "0"} label={big?.label} short={big?.short} onDone={() => bigDone.current()} />
          </div>
          <DryCounter dry={dry} prev={prev} avg={150} />
          {user ? (
            <SlotControls cfg={cfg} bet={bet} setBet={setBet} busy={busy} onSpin={() => void play(false)} onBuy={() => void play(true)} buyPrice={SWT.buyPrice}
              auto={auto} setAuto={setAuto} turbo={turbo} setTurbo={setTurbo} onInfo={() => setInfo(true)} accent={["#be185d", "#ff8ad8"]} lastWin={lastWin} />
          ) : <PlayButton onClick={() => {}}>Войти</PlayButton>}
          <ErrorLine text={error} />
        </div>
      </div>
      <RoundsPanel slug="sweets" version={version} describe={describe} />
      <InfoModal open={info} onClose={() => setInfo(false)} title="Сладкий взрыв — выплаты">
        <p>Поле 7×7, линий нет: платят <b>группы от 5 одинаковых конфет</b>, соприкасающихся сторонами. Выигрышные конфеты лопаются, оставшиеся падают вниз, сверху досыпаются новые. Числа — во сколько раз выигрыш больше общей ставки за группу 5 / 8 / 11–12 / 15+.</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.keys(SWT.pays).map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-xl bg-ink p-2">
              <span className="relative size-12 shrink-0"><SwtSym s={s} big /></span>
              <span className="font-mono text-[12px]">{[0, 3, 5, 7].map((i) => <span key={i} className="block">{["5", "8", "11+", "15+"][[0, 3, 5, 7].indexOf(i)]} — {SWT.pays[s]![i]}×</span>)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3">
          <span className="relative size-14 shrink-0"><SwtSym s="scatter" big /></span>
          <p><b className="text-[#ff8ad8]">Клетки-множители.</b> Когда конфета лопается, её клетка отмечается. Если в отмеченной клетке снова лопается конфета, там появляется <b>×2</b>, дальше множитель удваивается до <b>×128</b>. Множители внутри выигрышной группы складываются. 3–7 леденцов BONUS дают 10–30 бесплатных вращений, и <b>в бонусе клетки не сбрасываются</b> до конца. 3 леденца в бонусе — ещё +{SWT.retrigger}.</p>
        </div>
        <p>«Купить бонус» — {SWT.buyPrice}× ставки. Максимальный выигрыш — {SWT.maxWin.toLocaleString("ru-RU")}× ставки. Расчётный RTP ≈ 96%. Каждый раунд проверяется на странице «Честность».</p>
      </InfoModal>
    </div>
  );
}

function Intro({ spins }: { spins: number }) {
  return (
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="grid place-items-center gap-3 p-4 text-center">
      <motion.div animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.1, 1] }} transition={{ duration: 1.4, repeat: Infinity }} className="relative size-24 rounded-full shadow-[0_0_50px_#ff8ad8]"><SwtSym s="scatter" big /></motion.div>
      <p className="font-display text-[clamp(20px,5vw,34px)] font-bold text-[#ffe0f4]">{spins} БЕСПЛАТНЫХ ВРАЩЕНИЙ</p>
      <p className="max-w-xs text-[13.5px] text-white/80">Клетки-множители не сбрасываются: каждый новый взрыв в них удваивает множитель до ×128</p>
    </motion.div>
  );
}
