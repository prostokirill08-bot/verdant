"use client";
import { PAL, SlotSymbol, type SymDef } from "./NeonSymbols";
import { sfx } from "@/lib/sound";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { anticipationFrom, ATLAS, type AtlasResult, type AtlasSpin } from "@/lib/fair/slots";
import { ErrorLine, newKey, parsePoints, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "../kit";
import { BonusLabel, BonusTotal, DryCounter, InfoModal, Reels, SlotControls, sleep, useDrySpins, useSlotState, WinOverlay, winCells, winUnits, type BonusState, type LineWin, SLOT_ACCENT, SLOT_FRAME, SLOT_STAGE, SLOT_STAGE_BG, SLOT_TITLE } from "./SlotKit";

const NAMES: Record<string, string> = { astronaut: "Корона", telescope: "Компас", comet: "Звезда", planet: "Планета", book: "Атлас", A: "A", K: "K", Q: "Q", J: "J", "10": "10" };
/** Символы в стиле сайта: буквы — младшие, знаки — старшие, «Атлас» — wild и скаттер. */
const DEFS: Record<string, SymDef> = {
  "10": { letter: "10", color: PAL.teal }, J: { letter: "J", color: PAL.cyan }, Q: { letter: "Q", color: PAL.violet }, K: { letter: "K", color: PAL.orange }, A: { letter: "A", color: PAL.pink },
  comet: { glyph: "star", color: PAL.gold, tier: "high" }, planet: { glyph: "planet", color: PAL.blue, tier: "high" },
  telescope: { glyph: "compass", color: PAL.mint, tier: "high" }, astronaut: { glyph: "crown", color: PAL.lime, tier: "high" },
  book: { glyph: "v", color: PAL.lime, tier: "special", label: "BONUS" },
};
const SYMS = ATLAS.symbols.filter((s) => s !== "book");
const randomSym = () => (Math.random() < 0.06 ? "book" : SYMS[Math.floor(Math.random() * SYMS.length)]!);
// Стартовая раскладка фиксированная — одинаковая на сервере и в браузере (без ошибки гидратации)
const START: string[][] = [["A", "astronaut", "10"], ["K", "book", "Q"], ["telescope", "J", "A"], ["Q", "book", "comet"], ["planet", "K", "J"]];

export function Sym({ s, big }: { s: string; big?: boolean }) {
  return <SlotSymbol defs={DEFS} s={s} big={big} />;
}

const describe = (r: RoundView) => { const x = r.result as AtlasResult | null; if (!x) return "—"; return x.fs ? `Бонус: ${x.fs.spins.length} фриспинов · ${NAMES[x.fs.special]}${x.bought ? " (куплен)" : ""}` : x.base && x.base.mult > 0 ? `Выигрыш ${x.totalMult}×` : "Без выигрыша"; };

export function AtlasGame({ cfg }: { cfg: GameConfig }) {
  const { setBalance, balance, user } = useAuth();
  const { run, busy: reqBusy, error } = useGameRequest();
  const { bet, setBet, turbo, setTurbo, auto, setAuto } = useSlotState(cfg);
  const [grid, setGrid] = useState<string[][]>(START);
  const [spinKey, setSpinKey] = useState(0);
  const [lines, setLines] = useState<LineWin[]>([]);
  const [hl, setHl] = useState<Set<string> | null>(null);
  const [expand, setExpand] = useState<{ sym: string; reels: number[] } | null>(null);
  const [fs, setFs] = useState<(BonusState & { special: string }) | null>(null);
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [big, setBig] = useState<{ mult: number; amount: string; label?: string; short?: boolean } | null>(null);
  const { dry, prev, count } = useDrySpins("atlas", !!user);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [version, setVersion] = useState(0);
  const stop = useRef<() => void>(() => {});
  const bigDone = useRef<() => void>(() => {});
  const turboRef = useRef(turbo); turboRef.current = turbo;

  const [slowFrom, setSlowFrom] = useState<number | null>(null);
  // Интрига: если на первых барабанах уже 2 книги, оставшиеся крутятся дольше в ожидании третьей
  const spinTo = useCallback((g: string[][]) => new Promise<void>((res) => { stop.current = res; setHl(null); setLines([]); setExpand(null); setSlowFrom(anticipationFrom(g, "book")); setGrid(g); setSpinKey((k) => k + 1); }), []);
  const showBig = (mult: number, amount: string, label?: string, short = false) => new Promise<void>((res) => { bigDone.current = () => { setBig(null); res(); }; setBig({ mult, amount, label, short }); });

  async function showSpin(s: AtlasSpin, units: bigint, special: string | null) {
    await spinTo(s.grid);
    const cells = winCells(s.wins, ATLAS.lines);
    if (s.scatter.mult > 0 || s.retrigger) s.grid.forEach((col, reel) => col.forEach((x, row) => x === "book" && cells.add(`${reel}:${row}`)));
    setLines(s.wins); setHl(cells.size ? cells : null);
    if (s.mult > 0 && s.mult < 10) sfx(s.mult >= 3 ? "bigwin" : "win");   // от ×10 звучит большой выигрыш
    if (s.scatter.mult > 0 && !s.retrigger) sfx("gem");
    if (special && s.expand) {
      await sleep(turboRef.current ? 250 : 500);
      sfx("whoosh");
      setExpand({ sym: special, reels: s.expand.reels });
      await sleep(turboRef.current ? 600 : 1200);
    }
    if (s.mult > 0 && !special) setLastWin(winUnits(units, s.mult).toString());   // в бонусе показываем общую сумму
    await sleep(s.mult > 0 ? (turboRef.current ? 450 : 1000) : turboRef.current ? 120 : 250);
  }

  async function play(buy: boolean): Promise<boolean> {
    const units = parsePoints(bet) ?? 0n;
    setPlaying(true); setLastWin(null); setHl(null); setLines([]); setExpand(null);
    const r = await run<{ round: RoundView; balance: string }>("/api/games/atlas/bet", { amount: bet, params: { buy }, key: newKey() }, { deferBalance: true });
    if (!r) { setPlaying(false); return false; }
    // Сразу показываем списание ставки, итог — после анимации
    setBalance((BigInt(balance) - BigInt(r.round.bet)).toString());
    const res = r.round.result as unknown as AtlasResult;
    if (res.base) await showSpin(res.base, units, null);
    if (!res.bought) count(!!res.fs);   // счётчик спинов без бонуса
    if (res.fs) {
      const f = res.fs;
      sfx("bonus"); setBanner(<Intro special={f.special} count={ATLAS.freeSpins} />); await sleep(2600); setBanner(null);
      // Сумма бонуса считается сразу: выигрыш запускающего спина + каждый бесплатный спин
      const cap = winUnits(units, ATLAS.maxWin); const special = f.special;
      let total = res.base ? winUnits(units, res.base.mult) : 0n; let left = ATLAS.freeSpins; let tick = 0;
      setFs({ special, left, done: 0, total: total.toString(), add: null, tick });
      for (let i = 0; i < f.spins.length; i++) {
        const s = f.spins[i]!; left--;
        setFs({ special, left, done: i + 1, total: total.toString(), add: null, tick });
        await showSpin(s, units, special);
        const add = winUnits(units, s.mult);
        if (add > 0n) { total = total + add > cap ? cap : total + add; tick++; }
        setFs({ special, left, done: i + 1, total: total.toString(), add: add > 0n ? add.toString() : null, tick });
        setLastWin(total.toString());
        if (s.mult >= 10) await showBig(s.mult, add.toString(), `Бесплатное вращение ${i + 1}`, true);   // крупный выигрыш внутри бонуса
        if (add > 0n) await sleep(turboRef.current ? 250 : 500);
        if (s.retrigger) { sfx("bonus"); left += ATLAS.freeSpins; setFs({ special, left, done: i + 1, total: total.toString(), add: null, tick }); setBanner(<Retrigger />); await sleep(1500); setBanner(null); }
      }
      setFs({ special, left: 0, done: f.spins.length, total: r.round.payout, add: null, tick });
      await showBig(res.totalMult, r.round.payout, `Бонус: ${f.spins.length} вращений`);
      setFs(null);
    } else if (res.totalMult >= 10) await showBig(res.totalMult, r.round.payout);
    setLastWin(r.round.payout);
    setBalance(r.balance); setVersion((v) => v + 1); setPlaying(false);
    return true; // автоигра продолжается и после бонуса
  }

  // Автоигра: следующий спин, пока есть деньги; бонус её останавливает
  useEffect(() => {
    if (auto <= 0 || playing || reqBusy) return;
    if (user && (parsePoints(bet) ?? 0n) > BigInt(balance)) { setAuto(0); return; }
    const t = setTimeout(async () => { const cont = await play(false); setAuto((a) => (cont && a > 0 ? a - 1 : 0)); }, 250);
    return () => clearTimeout(t);
  }, [auto, playing, reqBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = playing || reqBusy;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <div className={SLOT_STAGE}>
        <div aria-hidden className={SLOT_STAGE_BG} />
        <div className="relative mx-auto grid max-w-[720px] gap-4 p-3 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className={SLOT_TITLE}>◈ ATLAS OF STARS</h2>
            <AnimatePresence>{fs && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-xl bg-black/50 px-3 py-1.5 ring-1 ring-accent/50">
                <span className="relative size-8 overflow-hidden rounded-md"><Sym s={fs.special} /></span>
                <span className="text-[12px] leading-tight"><b className="text-accent">Бесплатно: {fs.left}</b><br /><span className="text-white/70">особый символ</span></span>
              </motion.div>
            )}</AnimatePresence>
          </div>
          <BonusTotal state={fs} />
          <div className={SLOT_FRAME}>
            <Reels grid={grid} rows={3} spinKey={spinKey} turbo={turbo || !!fs} filler={randomSym} onStopped={() => stop.current()} slowFrom={slowFrom}
              render={(c) => <Sym s={c} />} highlight={hl} lines={lines} linePatterns={ATLAS.lines}
              overlay={expand && (
                <div className="pointer-events-none absolute inset-0 grid grid-cols-5 gap-1.5 sm:gap-2">
                  {[0, 1, 2, 3, 4].map((reel) => (
                    <div key={reel} className="relative">
                      {expand.reels.includes(reel) && (
                        <motion.div initial={{ scaleY: 0.33, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ duration: 0.45 }} className="absolute inset-0 overflow-hidden rounded-xl bg-[#1b1450] ring-2 ring-accent shadow-[0_0_30px_rgb(251_191_36/0.6)]">
                          <div className="absolute inset-x-[6%] top-1/2 aspect-square -translate-y-1/2"><Sym s={expand.sym} big /></div>
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>
              )} />
            <AnimatePresence>{banner && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/70 ">{banner}</motion.div>
            )}</AnimatePresence>
            <WinOverlay show={!!big} mult={big?.mult ?? 0} amount={big?.amount ?? "0"} label={big?.label} short={big?.short} onDone={() => bigDone.current()} />
          </div>
          <DryCounter dry={dry} prev={prev} avg={150} />
          {user ? (
            <SlotControls cfg={cfg} bet={bet} setBet={setBet} busy={busy} onSpin={() => void play(false)} onBuy={() => void play(true)} buyPrice={ATLAS.buyPrice}
              auto={auto} setAuto={setAuto} turbo={turbo} setTurbo={setTurbo} onInfo={() => setInfo(true)} accent={SLOT_ACCENT} lastWin={lastWin} />
          ) : <PlayButton onClick={() => {}}>Войти</PlayButton>}
          <ErrorLine text={error} />
        </div>
      </div>
      <RoundsPanel slug="atlas" version={version} describe={describe} />
      <InfoModal open={info} onClose={() => setInfo(false)} title="Atlas of Stars — выплаты">
        <p>10 линий, ставка делится поровну между линиями. Выплата — за 2–5 одинаковых символов слева направо. Числа ниже — во сколько раз выигрыш больше ставки на линию (ставка ÷ 10).</p>
        <div className="grid grid-cols-2 gap-2">
          {(["astronaut", "telescope", "comet", "planet", "A", "K", "Q", "J", "10"] as const).map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-xl bg-ink p-2">
              <span className="relative size-12 shrink-0"><Sym s={s} /></span>
              <span className="font-mono text-[12px]">{Object.entries(ATLAS.pays[s]!).reverse().map(([n, v]) => <span key={n} className="block">{n}× — {v}</span>)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3">
          <span className="relative size-14 shrink-0"><Sym s="book" /></span>
          <p><b className="text-accent">Атлас</b> — дикий символ и скаттер одновременно. 3, 4 или 5 атласов с надписью BONUS в любом месте платят 2×, 20× или 200× общей ставки и дают <b>10 бесплатных вращений</b>. Перед бонусом выбирается особый символ: во время бесплатных вращений он раскрывается на весь барабан и платит по всем 10 линиям, даже на несмежных барабанах.</p>
        </div>
        <p>Если на первых барабанах уже лежат 2 атласа, оставшиеся барабаны подсвечиваются и крутятся дольше — в ожидании третьего. Автоигру можно включить без лимита: она крутит, пока не нажмёшь «Стоп».</p>
        <p>«Купить бонус» сразу запускает бесплатные вращения за {ATLAS.buyPrice}× ставки. Максимальный выигрыш — {ATLAS.maxWin.toLocaleString("ru-RU")}× ставки. Расчётный RTP ≈ 95,5%. Результат каждого раунда проверяется на странице «Честность».</p>
      </InfoModal>
    </div>
  );
}

function Intro({ special, count }: { special: string; count: number }) {
  return (
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="grid place-items-center gap-3 p-4 text-center">
      <p className="font-display text-[clamp(20px,5vw,34px)] font-bold text-gradient">{count} БЕСПЛАТНЫХ ВРАЩЕНИЙ</p>
      <p className="text-white/80">Особый символ</p>
      <motion.div initial={{ rotateY: 180 }} animate={{ rotateY: 0 }} transition={{ duration: 0.8, delay: 0.3 }} className="relative size-28 rounded-2xl ring-4 ring-accent shadow-[0_0_40px_rgb(251_191_36/0.7)]"><Sym s={special} big /></motion.div>
      <p className="max-w-xs text-[13px] text-white/70">Раскрывается на весь барабан и платит по всем линиям</p>
    </motion.div>
  );
}
function Retrigger() {
  return <motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="font-display text-[28px] font-bold text-accent">+10 ВРАЩЕНИЙ!</motion.p>;
}

