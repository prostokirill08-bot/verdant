"use client";
import { sfx } from "@/lib/sound";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { CAT, type CatResult, type CatSpin } from "@/lib/fair/slots3";
import { ErrorLine, newKey, parsePoints, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "../kit";
import { BonusLabel, BonusTotal, DryCounter, InfoModal, Reels, SlotControls, sleep, useDrySpins, useSlotState, WinOverlay, winCells, winUnits, type BonusState, type LineWin } from "./SlotKit";

const IMG = new Set(["fish", "lure", "bucket", "rod", "boat", "fisher", "scatter"]);
const RANK: Record<string, [string, string]> = { "10": ["#8fdcff", "#1d4ed8"], J: ["#7cf5b6", "#15803d"], Q: ["#ffb3c1", "#be123c"], K: ["#ffd166", "#c2410c"], A: ["#c4b5fd", "#6d28d9"] };
const NAMES: Record<string, string> = { boat: "Лодка", rod: "Удочка", bucket: "Ведро улова", lure: "Блесна", fish: "Рыба", fisher: "Рыбак", scatter: "Лунка BONUS", A: "A", K: "K", Q: "Q", J: "J", "10": "10" };
const SYMS = ["10", "J", "Q", "K", "A", "fish", "lure", "bucket", "rod", "boat"];
type C = { s: string; v?: number };
const randomCell = (): C => (Math.random() < 0.05 ? { s: "scatter" } : { s: SYMS[Math.floor(Math.random() * SYMS.length)]! });
const START: C[][] = [[{ s: "A" }, { s: "boat" }, { s: "10" }], [{ s: "K" }, { s: "fish", v: 5 }, { s: "Q" }], [{ s: "rod" }, { s: "fisher" }, { s: "A" }], [{ s: "Q" }, { s: "scatter" }, { s: "lure" }], [{ s: "fish", v: 2 }, { s: "K" }, { s: "J" }]];
const fmtV = (v: number) => (v >= 1 ? `${v}×` : `${v}×`);

export function CatSym({ s, v, big }: { s: string; v?: number; big?: boolean }) {
  if (IMG.has(s)) return (
    <>
      <Image src={`/img/ny/slots/catch/${s}.webp`} alt={NAMES[s]!} fill sizes="120px" className={`rounded-lg object-cover ${s === "scatter" ? "ring-2 ring-[#8fdcff]/80" : s === "fisher" ? "ring-2 ring-gold/70" : ""}`} draggable={false} />
      {s === "scatter" && !big && <BonusLabel />}
      {s === "fisher" && !big && <span className="pointer-events-none absolute inset-x-0 bottom-[6%] mx-auto w-fit rounded-md bg-[linear-gradient(180deg,#fde68a,#f59e0b)] px-1.5 font-display text-[clamp(8px,2.2vw,13px)] font-bold text-[#3a2300]">WILD</span>}
      {s === "fish" && v !== undefined && !big && (
        <span className="pointer-events-none absolute inset-x-0 bottom-[5%] mx-auto w-fit rounded-md bg-black/75 px-1.5 font-mono text-[clamp(9px,2.4vw,14px)] font-bold text-[#7cf5b6] ring-1 ring-[#7cf5b6]/60" data-testid="fish-value">{fmtV(v)}</span>
      )}
    </>
  );
  const [a, b] = RANK[s] ?? ["#fff", "#999"];
  return (
    <span className="grid size-full place-items-center rounded-lg bg-[radial-gradient(circle,rgb(255_255_255/0.06),transparent_70%)]">
      <span className={`relative grid font-display font-bold leading-none ${big ? "text-[64px]" : "text-[clamp(24px,6vw,44px)]"}`}>
        <span aria-hidden className="col-start-1 row-start-1 translate-y-[3px]" style={{ color: b, textShadow: `0 0 10px ${a}88` }}>{s}</span>
        <span className="col-start-1 row-start-1" style={{ background: `linear-gradient(180deg, #fff 0%, ${a} 45%, ${b} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextStroke: "1px rgb(255 255 255 / 0.35)" }}>{s}</span>
      </span>
    </span>
  );
}

const toCells = (s: CatSpin): C[][] => s.grid.map((col, reel) => col.map((sym, row) => ({ s: sym, v: s.fish.find((f) => f.reel === reel && f.row === row)?.value })));
const describe = (r: RoundView) => { const x = r.result as CatResult | null; if (!x) return "—"; return x.fs ? `Бонус: ${x.fs.spins.length} вращений · рыбаков ${x.fs.fishers}${x.bought ? " (куплен)" : ""}` : x.base && x.base.mult > 0 ? `Выигрыш ${x.totalMult}×` : "Без выигрыша"; };

export function CatchGame({ cfg }: { cfg: GameConfig }) {
  const { setBalance, balance, user } = useAuth();
  const { run, busy: reqBusy, error } = useGameRequest();
  const { bet, setBet, turbo, setTurbo, auto, setAuto } = useSlotState(cfg);
  const [grid, setGrid] = useState<C[][]>(START);
  const [spinKey, setSpinKey] = useState(0);
  const [lines, setLines] = useState<LineWin[]>([]);
  const [hl, setHl] = useState<Set<string> | null>(null);
  const [fs, setFs] = useState<BonusState | null>(null);
  const [level, setLevel] = useState<{ lv: number; fishers: number } | null>(null);
  const [catchFx, setCatchFx] = useState<{ key: number; text: string } | null>(null);
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [big, setBig] = useState<{ mult: number; amount: string; label?: string; short?: boolean } | null>(null);
  const { dry, prev, count } = useDrySpins("catch", !!user);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [version, setVersion] = useState(0);
  const stop = useRef<() => void>(() => {});
  const bigDone = useRef<() => void>(() => {});
  const turboRef = useRef(turbo); turboRef.current = turbo;
  const t = (ms: number) => sleep(turboRef.current ? ms / 2 : ms);
  const spinTo = useCallback((g: C[][]) => new Promise<void>((res) => { stop.current = res; setHl(null); setLines([]); setGrid(g); setSpinKey((k) => k + 1); }), []);
  const showBig = (mult: number, amount: string, label?: string, short = false) => new Promise<void>((res) => { bigDone.current = () => { setBig(null); res(); }; setBig({ mult, amount, label, short }); });

  async function showSpin(s: CatSpin, units: bigint, inBonus: boolean) {
    await spinTo(toCells(s));
    const cells = winCells(s.lines, CAT.lines);
    if (s.scatter.mult > 0) s.grid.forEach((col, reel) => col.forEach((x, row) => x === "scatter" && cells.add(`${reel}:${row}`)));
    setLines(s.lines); setHl(cells.size ? cells : null);
    if (s.lines.length) sfx(s.mult >= 3 ? "bigwin" : "win");
    if (s.lines.length || s.scatter.mult) await t(900);
    // Бонус: каждый рыбак забирает ценники всех рыб на поле
    if (inBonus && s.fishers && s.fish.length) {
      const c = new Set<string>(); s.grid.forEach((col, reel) => col.forEach((x, row) => (x === "fisher" || x === "fish") && c.add(`${reel}:${row}`)));
      setLines([]); setHl(c); sfx("whistle"); await t(500);
      for (let i = 0; i < s.fish.length; i++) sfx("coin", { delay: i * 90, pitch: 1 + i * 0.06 });
      setCatchFx({ key: Date.now(), text: `Улов: ${s.fish.map((f) => f.value).reduce((a, b) => a + b, 0)}×${s.fishers > 1 ? ` × ${s.fishers} рыбака` : ""}${CAT.levels[s.level]! > 1 ? ` × ${CAT.levels[s.level]}` : ""} = ${s.collected}×` });
      await t(1400); setCatchFx(null);
    } else if (inBonus && s.fishers) { setHl(new Set(s.grid.flatMap((col, reel) => col.map((x, row) => (x === "fisher" ? `${reel}:${row}` : "")).filter(Boolean)))); sfx("drop"); await t(500); }
    if (!inBonus && s.mult > 0) setLastWin(winUnits(units, s.mult).toString());
    await t(s.mult > 0 ? 300 : 150);
  }

  async function play(buy: boolean): Promise<boolean> {
    const units = parsePoints(bet) ?? 0n;
    setPlaying(true); setLastWin(null); setHl(null); setLines([]);
    const r = await run<{ round: RoundView; balance: string }>("/api/games/catch/bet", { amount: bet, params: { buy }, key: newKey() }, { deferBalance: true });
    if (!r) { setPlaying(false); return false; }
    setBalance((BigInt(balance) - BigInt(r.round.bet)).toString());
    const res = r.round.result as unknown as CatResult;
    if (res.base) await showSpin(res.base, units, false);
    if (!res.bought) count(!!res.fs);
    if (res.fs) {
      const f = res.fs; let left = res.base ? res.base.trigger : CAT.freeSpins[3]!;
      sfx("bonus"); sfx("bells", { delay: 400 }); setBanner(<Intro spins={left} />); await sleep(3000); setBanner(null);
      const cap = winUnits(units, CAT.maxWin);
      let total = res.base ? winUnits(units, res.base.mult) : 0n; let tick = 0; let fishers = 0;
      setLevel({ lv: 0, fishers: 0 });
      for (let i = 0; i < f.spins.length; i++) {
        const s = f.spins[i]!; left--;
        setFs({ left, done: i + 1, total: total.toString(), add: null, tick });
        await showSpin(s, units, true);
        const add = winUnits(units, s.mult);
        if (add > 0n) { total = total + add > cap ? cap : total + add; tick++; }
        fishers += s.fishers;
        setFs({ left, done: i + 1, total: total.toString(), add: add > 0n ? add.toString() : null, tick });
        setLevel({ lv: s.levelUp ? Math.min(CAT.levels.length - 1, Math.floor(fishers / CAT.perLevel)) : s.level, fishers });
        setLastWin(total.toString());
        if (s.mult >= 10) await showBig(s.mult, add.toString(), `Вращение ${i + 1}`, true);
        if (s.levelUp) {
          const lv = Math.min(CAT.levels.length - 1, Math.floor(fishers / CAT.perLevel)); left += CAT.levelSpins;
          sfx("upgrade"); sfx("bonus", { delay: 300 });
          setBanner(<motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="grid place-items-center gap-1 text-center"><p className="font-display text-[26px] font-bold text-[#7cf5b6]">+{CAT.levelSpins} ВРАЩЕНИЙ</p><p className="font-display text-[20px] font-bold text-gold">Улов теперь ×{CAT.levels[lv]}</p></motion.div>);
          setFs({ left, done: i + 1, total: total.toString(), add: null, tick });
          await sleep(1600); setBanner(null);
        }
      }
      await showBig(res.totalMult, r.round.payout, `Бонус: ${f.spins.length} вращений · рыбаков ${f.fishers}`);
      setFs(null); setLevel(null);
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
  const nextAt = level ? Math.min(CAT.levels.length - 1, level.lv + 1) * CAT.perLevel : 0;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <div className="relative overflow-hidden rounded-[28px] ring-1 ring-white/10" style={{ boxShadow: "0 30px 80px -40px #7cf5b6" }}>
        <Image src="/img/ny/bg/catch.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#06202e]/45 via-[#071a26]/35 to-[#070b1f]/92" />
        <div className="relative mx-auto grid max-w-[720px] gap-4 p-3 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-[clamp(20px,4vw,30px)] font-bold tracking-wide text-[#d9fff1] drop-shadow-[0_2px_14px_rgb(124_245_182/0.8)]">🎣 БОЛЬШОЙ УЛОВ</h2>
            {level && (
              <div className="flex items-center gap-2 rounded-xl bg-black/55 px-3 py-1.5 ring-1 ring-[#7cf5b6]/40" data-testid="catch-level">
                <span className="text-[12px] text-white/70">Рыбаки</span>
                <span className="flex gap-0.5">{Array.from({ length: CAT.perLevel }, (_, i) => <span key={i} className={`size-2.5 rounded-full ${level.lv >= CAT.levels.length - 1 || i < level.fishers % CAT.perLevel ? "bg-[#7cf5b6] shadow-[0_0_8px_#7cf5b6]" : "bg-white/20"}`} />)}</span>
                <motion.span key={level.lv} initial={{ scale: 1.6 }} animate={{ scale: 1 }} className="font-display text-[18px] font-bold text-gold">×{CAT.levels[level.lv]}</motion.span>
                {level.lv < CAT.levels.length - 1 && <span className="text-[11px] text-white/55">до ×{CAT.levels[level.lv + 1]}: {Math.max(0, nextAt - level.fishers)}</span>}
              </div>
            )}
          </div>
          <BonusTotal state={fs} color="#7cf5b6" title="🎣 Рыбалка" sub={fs ? "Каждый рыбак забирает ценники всех рыб на поле" : undefined} />
          <div className="snow-cap relative rounded-2xl bg-[linear-gradient(180deg,#0f4a5e,#072433)] p-2 shadow-[inset_0_0_0_2px_rgb(124_245_182/0.5),0_20px_50px_-20px_#000] sm:p-3">
            <Reels grid={grid} rows={3} spinKey={spinKey} turbo={turbo || !!fs} filler={randomCell} onStopped={() => stop.current()}
              render={(c) => <span className="relative block size-full"><CatSym s={c.s} v={c.v} /></span>} highlight={hl} lines={lines} linePatterns={CAT.lines} />
            <AnimatePresence>{catchFx && (
              <motion.p key={catchFx.key} initial={{ opacity: 0, y: 10, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-x-0 top-1/2 z-10 mx-auto w-fit -translate-y-1/2 rounded-2xl bg-black/80 px-4 py-2 text-center font-display text-[clamp(15px,3.6vw,22px)] font-bold text-[#7cf5b6] ring-2 ring-[#7cf5b6]/60" data-testid="catch-fx">{catchFx.text}</motion.p>
            )}</AnimatePresence>
            <AnimatePresence>{banner && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/80">{banner}</motion.div>
            )}</AnimatePresence>
            <WinOverlay show={!!big} mult={big?.mult ?? 0} amount={big?.amount ?? "0"} label={big?.label} short={big?.short} onDone={() => bigDone.current()} />
          </div>
          <DryCounter dry={dry} prev={prev} avg={220} />
          {user ? (
            <SlotControls cfg={cfg} bet={bet} setBet={setBet} busy={busy} onSpin={() => void play(false)} onBuy={() => void play(true)} buyPrice={CAT.buyPrice}
              auto={auto} setAuto={setAuto} turbo={turbo} setTurbo={setTurbo} onInfo={() => setInfo(true)} accent={["#0f766e", "#5eead4"]} lastWin={lastWin} />
          ) : <PlayButton onClick={() => {}}>Войти</PlayButton>}
          <ErrorLine text={error} />
        </div>
      </div>
      <RoundsPanel slug="catch" version={version} describe={describe} />
      <InfoModal open={info} onClose={() => setInfo(false)} title="Большой улов — выплаты">
        <p>5 барабанов, 10 линий, выигрыш слева направо. Числа — во сколько раз выигрыш больше ставки на линию (ставка на линию = общая ставка / 10). Рыбак — дикий символ на барабанах 2–5.</p>
        <div className="grid grid-cols-2 gap-2">
          {["boat", "rod", "bucket", "lure", "fish", "A", "K", "Q", "J", "10"].map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-xl bg-ink p-2">
              <span className="relative size-12 shrink-0"><CatSym s={s} big /></span>
              <span className="font-mono text-[12px]">{Object.entries(CAT.pays[s]!).reverse().map(([n, v]) => <span key={n} className="block">{n} — {v}</span>)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3">
          <span className="relative size-14 shrink-0"><CatSym s="fisher" big /></span>
          <p><b className="text-[#7cf5b6]">Рыбалка.</b> 3, 4 или 5 лунок BONUS платят {CAT.scatterPays[3]}×, {CAT.scatterPays[4]}× или {CAT.scatterPays[5]}× ставки и дают 10, 15 или 20 бесплатных вращений. На каждой рыбе — ценник от 1× до 400× ставки. В бонусе <b>каждый рыбак забирает ценники всех рыб на поле</b>. Каждые {CAT.perLevel} рыбака — ещё +{CAT.levelSpins} вращений и новый множитель улова: ×2, ×3, ×10.</p>
        </div>
        <p>«Купить бонус» — {CAT.buyPrice}× ставки. Максимальный выигрыш — {CAT.maxWin.toLocaleString("ru-RU")}× ставки. Расчётный RTP ≈ 96%. Каждый раунд проверяется на странице «Честность».</p>
      </InfoModal>
    </div>
  );
}

function Intro({ spins }: { spins: number }) {
  return (
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="grid place-items-center gap-3 p-4 text-center">
      <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 1.2, repeat: Infinity }} className="relative size-24 rounded-2xl ring-4 ring-[#7cf5b6] shadow-[0_0_50px_#7cf5b6]"><CatSym s="fisher" big /></motion.div>
      <p className="font-display text-[clamp(20px,5vw,34px)] font-bold text-[#d9fff1]">{spins} БЕСПЛАТНЫХ ВРАЩЕНИЙ</p>
      <p className="max-w-xs text-[13.5px] text-white/80">Рыбак забирает все ценники с рыб. Каждые 4 рыбака — ещё вращения и множитель улова ×2, ×3, ×10</p>
    </motion.div>
  );
}
