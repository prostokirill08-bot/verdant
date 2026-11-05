"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { AVA, type AvaResult, type AvaSpin } from "@/lib/fair/slots2";
import { sfx } from "@/lib/sound";
import { ErrorLine, newKey, parsePoints, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "../kit";
import { BonusLabel, BonusTotal, DryCounter, InfoModal, SlotControls, sleep, useDrySpins, useSlotState, WinOverlay, winUnits, type BonusState } from "./SlotKit";

const NAMES: Record<string, string> = {
  bear: "Мишка", owl: "Сова", fox: "Песец", penguin: "Пингвин", ice_pink: "Розовый лёд", ice_purple: "Фиолетовый лёд", ice_green: "Зелёный лёд", ice_blue: "Голубой лёд", snowflake: "Снежинка",
};
const R = AVA.reels, ROWS = AVA.rows;
const START: string[][] = [
  ["ice_blue", "bear", "ice_green", "penguin", "ice_pink"], ["fox", "ice_purple", "snowflake", "ice_blue", "owl"], ["ice_green", "penguin", "ice_pink", "bear", "ice_blue"],
  ["owl", "ice_blue", "fox", "ice_purple", "ice_green"], ["ice_pink", "snowflake", "ice_blue", "penguin", "fox"], ["penguin", "ice_green", "owl", "ice_pink", "bear"],
];
type Cell = { id: number; sym: string; reel: number; row: number; fresh: boolean; delay: number };
let seq = 0;
const fromGrid = (g: string[][], drop = true): Cell[] => g.flatMap((col, reel) => col.map((sym, row) => ({ id: ++seq, sym, reel, row, fresh: drop, delay: reel * 0.06 + (ROWS - row) * 0.035 })));

export function AvaSym({ s, big }: { s: string; big?: boolean }) {
  return (
    <>
      <Image src={`/img/ny/slots/avalanche/${s}.webp`} alt={NAMES[s] ?? s} fill sizes="100px" className={`rounded-lg object-cover ${s === "snowflake" ? "ring-2 ring-[#8fdcff]" : ""}`} draggable={false} />
      {s === "snowflake" && !big && <BonusLabel />}
    </>
  );
}

const describe = (r: RoundView) => { const x = r.result as AvaResult | null; if (!x) return "—"; return x.fs ? `Бонус: ${x.fs.spins.length} вращений${x.bought ? " (куплен)" : ""}` : x.base && x.base.mult > 0 ? `Выигрыш ${x.totalMult}× · обвалов ${x.base.steps.length - 1}` : "Без выигрыша"; };

/** Поле 6×5 с каскадами: символы падают сверху, выигрышные раскалываются, оставшиеся проваливаются вниз. */
function CascadeGrid({ cells, hot, shards }: { cells: Cell[]; hot: Set<string>; shards: { key: number; reel: number; row: number }[] }) {
  return (
    <div className="relative aspect-[6/5] w-full overflow-hidden rounded-xl" data-testid="ava-grid">
      <AnimatePresence>
        {cells.map((c) => {
          const isHot = hot.has(`${c.reel}:${c.row}`);
          return (
            <motion.div key={c.id} layout="position"
              initial={c.fresh ? { y: "-520%", opacity: 0.4 } : false} animate={{ y: 0, opacity: 1, scale: isHot ? [1, 1.12, 1] : 1 }}
              exit={{ scale: 1.35, opacity: 0, rotate: 12, transition: { duration: 0.28 } }}
              transition={{ y: { duration: 0.42, delay: c.fresh ? c.delay : 0, ease: [0.3, 0.9, 0.4, 1.06] }, layout: { duration: 0.35, ease: [0.3, 0.9, 0.4, 1.06] }, scale: { duration: 0.5, repeat: isHot ? Infinity : 0 } }}
              className="absolute p-[3%]" style={{ left: `${(c.reel * 100) / R}%`, top: `${(c.row * 100) / ROWS}%`, width: `${100 / R}%`, height: `${100 / ROWS}%` }}>
              <div className={`relative size-full rounded-lg ${isHot ? "shadow-[0_0_22px_#8fdcff] ring-2 ring-white" : ""}`}><AvaSym s={c.sym} /></div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {/* Ледяные осколки на месте раскалывающихся символов */}
      {shards.map((s) => (
        <div key={s.key} className="pointer-events-none absolute" style={{ left: `${((s.reel + 0.5) * 100) / R}%`, top: `${((s.row + 0.5) * 100) / ROWS}%` }}>
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 2 + s.key; return (
              <motion.span key={i} initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }} animate={{ x: Math.cos(a) * 46, y: Math.sin(a) * 46 + 30, opacity: 0, rotate: 180 }} transition={{ duration: 0.7, ease: "easeOut" }}
                className="absolute h-2.5 w-1.5 bg-[linear-gradient(180deg,#fff,#8fdcff)] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function AvalancheGame({ cfg }: { cfg: GameConfig }) {
  const { setBalance, balance, user } = useAuth();
  const { run, busy: reqBusy, error } = useGameRequest();
  const { bet, setBet, turbo, setTurbo, auto, setAuto } = useSlotState(cfg);
  const [cells, setCells] = useState<Cell[]>(() => fromGrid(START, false));
  const [hot, setHot] = useState<Set<string>>(new Set());
  const [shards, setShards] = useState<{ key: number; reel: number; row: number }[]>([]);
  const [x, setX] = useState<number | null>(null);
  const [winText, setWinText] = useState<string | null>(null);
  const [fs, setFs] = useState<BonusState | null>(null);
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [big, setBig] = useState<{ mult: number; amount: string; label?: string; short?: boolean } | null>(null);
  const { dry, prev, count } = useDrySpins("avalanche", !!user);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [version, setVersion] = useState(0);
  const bigDone = useRef<() => void>(() => {});
  const turboRef = useRef(turbo); turboRef.current = turbo;
  const t = (ms: number) => sleep(turboRef.current ? ms / 2 : ms);
  const showBig = (mult: number, amount: string, label?: string, short = false) => new Promise<void>((res) => { bigDone.current = () => { setBig(null); res(); }; setBig({ mult, amount, label, short }); });

  /** Показ одного вращения: падение символов, затем каскады — раскол, обвал, досыпание. */
  async function showSpin(s: AvaSpin, units: bigint, inBonus: boolean, onWin?: (add: bigint) => void) {
    setHot(new Set()); setWinText(null);
    sfx("whoosh");
    let cur = fromGrid(s.steps[0]!.grid);
    setCells(cur);
    for (let r = 0; r < R; r++) sfx("drop", { i: r, delay: 120 + r * 60 });
    await t(750);
    let shown = 0n;
    for (let k = 0; k < s.steps.length; k++) {
      const st = s.steps[k]!;
      if (!st.wins.length) break;
      // Подсветка выигрыша
      const gone = new Set(st.wins.flatMap((w) => w.cells));
      setHot(gone);
      const best = [...st.wins].sort((a, b) => b.mult - a.mult)[0]!;
      setWinText(`${NAMES[best.sym]} ×${best.count}${st.x > 1 ? ` · множитель ×${st.x}` : ""}${st.wins.length > 1 ? ` и ещё ${st.wins.length - 1}` : ""}`);
      sfx(st.mult >= 5 ? "bigwin" : "win");
      shown += winUnits(units, st.mult);
      if (!inBonus) setLastWin(shown.toString()); else onWin?.(winUnits(units, st.mult));   // сумма бонуса растёт с каждым обвалом
      await t(700);
      // Раскол: символы исчезают, летят осколки
      sfx("ice"); sfx("ice", { delay: 90 });
      setShards([...gone].map((c, i) => { const [reel, row] = c.split(":").map(Number); return { key: Date.now() + i, reel: reel!, row: row! }; }));
      setHot(new Set());
      const next = s.steps[k + 1]!.grid;
      // Сопоставляем символы: оставшиеся сохраняют id (и плавно падают вниз), новые падают сверху
      const nextCells: Cell[] = [];
      for (let reel = 0; reel < R; reel++) {
        const kept = cur.filter((c) => c.reel === reel && !gone.has(`${c.reel}:${c.row}`)).sort((a, b) => a.row - b.row);
        const fresh = ROWS - kept.length;
        next[reel]!.forEach((sym, row) => {
          if (row < fresh) nextCells.push({ id: ++seq, sym, reel, row, fresh: true, delay: 0.1 + (fresh - row) * 0.05 });
          else { const c = kept[row - fresh]!; nextCells.push({ ...c, row, fresh: false }); }
        });
        if (fresh) sfx("drop", { i: reel, delay: 200 + reel * 40 });
      }
      cur = nextCells; setCells(nextCells);
      // Множитель лавины растёт после каждого выигрышного обвала (в бонусе)
      if (inBonus) { setX(st.x + 1); sfx("chime", { pitch: 1 + Math.min(st.x, 20) * 0.04, delay: 250 }); }
      await t(750); setShards([]);
    }
    if (s.scatter.count >= 4) { const sc = new Set<string>(); cur.forEach((c) => c.sym === "snowflake" && sc.add(`${c.reel}:${c.row}`)); setHot(sc); sfx("gem"); await t(600); }
    await t(s.mult > 0 ? 400 : 150);
  }

  async function play(buy: boolean): Promise<boolean> {
    const units = parsePoints(bet) ?? 0n;
    setPlaying(true); setLastWin(null); setHot(new Set()); setWinText(null);
    const r = await run<{ round: RoundView; balance: string }>("/api/games/avalanche/bet", { amount: bet, params: { buy }, key: newKey() }, { deferBalance: true });
    if (!r) { setPlaying(false); return false; }
    setBalance((BigInt(balance) - BigInt(r.round.bet)).toString());
    const res = r.round.result as unknown as AvaResult;
    if (res.base) await showSpin(res.base, units, false);
    if (!res.bought) count(!!res.fs);
    if (res.fs) {
      const f = res.fs;
      sfx("rumble"); sfx("bonus", { delay: 500 }); setBanner(<Intro />); await sleep(3000); setBanner(null);
      let total = res.base ? winUnits(units, res.base.mult) : 0n; let left = AVA.freeSpins; let tick = 0;
      setX(1);
      for (let i = 0; i < f.spins.length; i++) {
        const s = f.spins[i]!; left--;
        setFs({ left, done: i + 1, total: total.toString(), add: null, tick });
        let got = 0n;
        await showSpin(s, units, true, (a) => { got += a; total += a; tick++; sfx("coin"); setFs({ left, done: i + 1, total: total.toString(), add: a.toString(), tick }); });
        const add = winUnits(units, s.mult);
        if (add > got) { total += add - got; tick++; setFs({ left, done: i + 1, total: total.toString(), add: (add - got).toString(), tick }); }   // выплата за снежинки
        setLastWin(total.toString());
        if (s.mult >= 10) await showBig(s.mult, add.toString(), `Вращение ${i + 1} · лавина ×${s.xAfter}`, true);
        if (s.scatter.count >= 3) { sfx("rumble"); left += AVA.retrigger; setBanner(<motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="font-display text-[28px] font-bold text-[#cfe9ff]">+{AVA.retrigger} ВРАЩЕНИЙ!</motion.p>); await sleep(1400); setBanner(null); }
      }
      await showBig(res.totalMult, r.round.payout, `Бонус: ${f.spins.length} вращений · лавина ×${f.spins.at(-1)?.xAfter ?? 1}`);
      setFs(null); setX(null);
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
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <div className="relative overflow-hidden rounded-[28px] ring-1 ring-white/10" style={{ boxShadow: "0 30px 80px -40px #8fdcff" }}>
        <Image src="/img/ny/bg/avalanche.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#06142e]/40 via-[#071026]/30 to-[#070b1f]/92" />
        <div className="relative mx-auto grid max-w-[720px] gap-4 p-3 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[clamp(20px,4vw,30px)] font-bold tracking-wide text-[#e0f2fe] drop-shadow-[0_2px_14px_rgb(143_220_255/0.9)]">❄️ ЛАВИНА</h2>
            <AnimatePresence>{x !== null && (
              <motion.div key={x} initial={{ scale: 1.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 12 }}
                className="rounded-2xl bg-[linear-gradient(180deg,#e0f2fe,#60a5fa)] px-3 py-1 font-display text-[clamp(20px,4vw,28px)] font-bold text-[#06142e] shadow-[0_0_30px_#8fdcff]" data-testid="ava-x">×{x}</motion.div>
            )}</AnimatePresence>
          </div>
          <BonusTotal state={fs} color="#8fdcff" title="❄️ Лавина" sub={fs && x ? `Множитель лавины ×${x} — растёт с каждым обвалом` : undefined} />
          <div className="snow-cap relative rounded-2xl bg-[linear-gradient(180deg,#123a6b,#071a38)] p-2 shadow-[inset_0_0_0_2px_rgb(191_230_255/0.6),0_20px_50px_-20px_#000] sm:p-3">
            <CascadeGrid cells={cells} hot={hot} shards={shards} />
            <AnimatePresence>{winText && (
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-0 -bottom-1 z-10 mx-auto w-fit rounded-full bg-black/70 px-3 py-1 text-[12.5px] font-semibold text-[#cfe9ff] ring-1 ring-[#8fdcff]/40">{winText}</motion.p>
            )}</AnimatePresence>
            <AnimatePresence>{banner && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/75">{banner}</motion.div>
            )}</AnimatePresence>
            <WinOverlay show={!!big} mult={big?.mult ?? 0} amount={big?.amount ?? "0"} label={big?.label} short={big?.short} onDone={() => bigDone.current()} />
          </div>
          <DryCounter dry={dry} prev={prev} avg={250} />
          {user ? (
            <SlotControls cfg={cfg} bet={bet} setBet={setBet} busy={busy} onSpin={() => void play(false)} onBuy={() => void play(true)} buyPrice={AVA.buyPrice}
              auto={auto} setAuto={setAuto} turbo={turbo} setTurbo={setTurbo} onInfo={() => setInfo(true)} accent={["#1d4ed8", "#60a5fa"]} lastWin={lastWin} />
          ) : <PlayButton onClick={() => {}}>Войти</PlayButton>}
          <ErrorLine text={error} />
        </div>
      </div>
      <RoundsPanel slug="avalanche" version={version} describe={describe} />
      <InfoModal open={info} onClose={() => setInfo(false)} title="Лавина — выплаты">
        <p>Поле 6×5, линий нет: платят <b>8 и больше одинаковых символов в любом месте</b>. Выигрышные символы раскалываются, оставшиеся падают вниз, сверху досыпаются новые — и так, пока появляются новые выигрыши (каскад). Числа — во сколько раз выигрыш больше общей ставки за 8–9 / 10–11 / 12+ символов.</p>
        <div className="grid grid-cols-2 gap-2">
          {[...AVA.high].reverse().concat([...AVA.low].reverse()).map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-xl bg-ink p-2">
              <span className="relative size-12 shrink-0"><AvaSym s={s} big /></span>
              <span className="font-mono text-[12px]">{AVA.pays[s]!.map((v, i) => <span key={i} className="block">{["8+", "10+", "12+"][i]} — {v}×</span>)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3">
          <span className="relative size-14 shrink-0"><AvaSym s="snowflake" big /></span>
          <p><b className="text-[#8fdcff]">Снежинка</b>: 4, 5 или 6 в любом месте платят {AVA.scatterPays[4]}×, {AVA.scatterPays[5]}× или {AVA.scatterPays[6]}× ставки и запускают <b>{AVA.freeSpins} бесплатных вращений</b>. В бонусе работает <b>множитель лавины</b>: он начинается с ×1 и растёт на +1 после каждого выигрышного обвала — и не сбрасывается между вращениями. 3 снежинки в бонусе — ещё +{AVA.retrigger}.</p>
        </div>
        <p>«Купить бонус» — {AVA.buyPrice}× ставки. Максимальный выигрыш — {AVA.maxWin.toLocaleString("ru-RU")}× ставки. Расчётный RTP ≈ 97%. Каждый раунд проверяется на странице «Честность».</p>
      </InfoModal>
    </div>
  );
}

function Intro() {
  return (
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="grid place-items-center gap-3 p-4 text-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} className="relative size-24 rounded-full shadow-[0_0_50px_#8fdcff]"><AvaSym s="snowflake" big /></motion.div>
      <p className="font-display text-[clamp(20px,5vw,34px)] font-bold text-[#e0f2fe]">{AVA.freeSpins} БЕСПЛАТНЫХ ВРАЩЕНИЙ</p>
      <p className="max-w-xs text-[13.5px] text-white/80">Каждый обвал увеличивает множитель лавины на +1 — и он копится до конца бонуса</p>
    </motion.div>
  );
}
