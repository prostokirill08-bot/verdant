"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { anticipationFrom, ATLAS, type AtlasResult, type AtlasSpin } from "@/lib/fair/slots";
import { ErrorLine, newKey, parsePoints, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "../kit";
import { BonusLabel, InfoModal, Reels, SlotControls, sleep, useSlotState, WinOverlay, winCells, type LineWin } from "./SlotKit";

const IMG: Record<string, string> = { astronaut: "astronaut", telescope: "telescope", comet: "comet", planet: "planet", book: "book" };
const RANK: Record<string, [string, string]> = { "10": ["#ff6b6b", "#c2185b"], J: ["#60a5fa", "#1d4ed8"], Q: ["#4ade80", "#15803d"], K: ["#fbbf24", "#c2410c"], A: ["#c084fc", "#7e22ce"] };
const NAMES: Record<string, string> = { astronaut: "Космо-Санта", telescope: "Телескоп с гирляндой", comet: "Рождественская звезда", planet: "Ёлочный шар", book: "Атлас Деда Мороза", A: "A", K: "K", Q: "Q", J: "J", "10": "10" };
const SYMS = ATLAS.symbols.filter((s) => s !== "book");
const randomSym = () => (Math.random() < 0.06 ? "book" : SYMS[Math.floor(Math.random() * SYMS.length)]!);
// Стартовая раскладка фиксированная — одинаковая на сервере и в браузере (без ошибки гидратации)
const START: string[][] = [["A", "astronaut", "10"], ["K", "book", "Q"], ["telescope", "J", "A"], ["Q", "book", "comet"], ["planet", "K", "J"]];

export function Sym({ s, big }: { s: string; big?: boolean }) {
  if (IMG[s]) return (
    <>
      <Image src={`/img/ny/slots/atlas/${IMG[s]}.webp`} alt={NAMES[s]!} fill sizes="120px" className={`rounded-lg object-cover ${s === "book" ? "ring-2 ring-gold/70" : ""}`} draggable={false} />
      {s === "book" && !big && <BonusLabel />}
    </>
  );
  const [a, b] = RANK[s] ?? ["#fff", "#999"];
  return (
    <span className="grid size-full place-items-center rounded-lg bg-[radial-gradient(circle,rgb(255_255_255/0.06),transparent_70%)]">
      <span className={`font-display font-bold leading-none ${big ? "text-[64px]" : "text-[clamp(24px,6vw,44px)]"}`}
        style={{ background: `linear-gradient(180deg, #fff 0%, ${a} 45%, ${b} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextStroke: "1px rgb(255 255 255 / 0.35)", filter: `drop-shadow(0 3px 0 ${b}) drop-shadow(0 0 10px ${a}88)` }}>{s}</span>
    </span>
  );
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
  const [fs, setFs] = useState<{ special: string; left: number; total: number; done: number } | null>(null);
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [big, setBig] = useState<{ mult: number; amount: string; label?: string } | null>(null);
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
  const showBig = (mult: number, amount: string, label?: string) => new Promise<void>((res) => { bigDone.current = () => { setBig(null); res(); }; setBig({ mult, amount, label }); });

  async function showSpin(s: AtlasSpin, units: bigint, special: string | null) {
    await spinTo(s.grid);
    const cells = winCells(s.wins, ATLAS.lines);
    if (s.scatter.mult > 0 || s.retrigger) s.grid.forEach((col, reel) => col.forEach((x, row) => x === "book" && cells.add(`${reel}:${row}`)));
    setLines(s.wins); setHl(cells.size ? cells : null);
    if (special && s.expand) {
      await sleep(turboRef.current ? 250 : 500);
      setExpand({ sym: special, reels: s.expand.reels });
      await sleep(turboRef.current ? 600 : 1200);
    }
    if (s.mult > 0) setLastWin(((units * BigInt(Math.round(s.mult * 10000))) / 10000n).toString());
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
    if (res.fs) {
      const f = res.fs;
      setBanner(<Intro special={f.special} count={ATLAS.freeSpins} />); await sleep(2600); setBanner(null);
      let total = 0; let left = ATLAS.freeSpins;
      setFs({ special: f.special, left, total: 0, done: 0 });
      for (let i = 0; i < f.spins.length; i++) {
        const s = f.spins[i]!; left--;
        setFs({ special: f.special, left, total, done: i + 1 });
        await showSpin(s, units, f.special);
        total += s.mult;
        if (s.retrigger) { left += ATLAS.freeSpins; setBanner(<Retrigger />); await sleep(1500); setBanner(null); }
        setFs({ special: f.special, left, total, done: i + 1 });
      }
      await showBig(res.totalMult, r.round.payout, `Бонус: ${f.spins.length} вращений`);
      setFs(null);
    } else if (res.totalMult >= 10) await showBig(res.totalMult, r.round.payout);
    setLastWin(r.round.payout);
    setBalance(r.balance); setVersion((v) => v + 1); setPlaying(false);
    return true; // автоигра продолжается и после бонуса
  }

  // Автоигра: следующий спин, пока есть баллы; бонус её останавливает
  useEffect(() => {
    if (auto <= 0 || playing || reqBusy) return;
    if (user && (parsePoints(bet) ?? 0n) > BigInt(balance)) { setAuto(0); return; }
    const t = setTimeout(async () => { const cont = await play(false); setAuto((a) => (cont && a > 0 ? a - 1 : 0)); }, 250);
    return () => clearTimeout(t);
  }, [auto, playing, reqBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = playing || reqBusy;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <div className="relative overflow-hidden rounded-[28px] ring-1 ring-white/10" style={{ boxShadow: "0 30px 80px -40px #5b8cff" }}>
        <Image src="/img/ny/bg/atlas.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070b1f]/40 via-[#070b1f]/30 to-[#070b1f]/90" />
        <div className="relative mx-auto grid max-w-[720px] gap-4 p-3 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[clamp(20px,4vw,30px)] font-bold tracking-wide text-gold drop-shadow-[0_2px_12px_rgb(124_92_255/0.9)]">🎄 АТЛАС ЗВЁЗД</h2>
            <AnimatePresence>{fs && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-xl bg-black/50 px-3 py-1.5 ring-1 ring-gold/50">
                <span className="relative size-8 overflow-hidden rounded-md"><Sym s={fs.special} /></span>
                <span className="text-[12px] leading-tight"><b className="text-gold">Бесплатно: {fs.left}</b><br /><span className="text-white/70">Бонус: {fs.total.toFixed(2)}×</span></span>
              </motion.div>
            )}</AnimatePresence>
          </div>
          <div className="snow-cap relative rounded-2xl bg-[linear-gradient(180deg,#1b2a6b,#0b1238)] p-2 shadow-[inset_0_0_0_2px_rgb(255_209_102/0.55),0_20px_50px_-20px_#000] sm:p-3">
            <Reels grid={grid} rows={3} spinKey={spinKey} turbo={turbo || !!fs} filler={randomSym} onStopped={() => stop.current()} slowFrom={slowFrom}
              render={(c) => <Sym s={c} />} highlight={hl} lines={lines} linePatterns={ATLAS.lines}
              overlay={expand && (
                <div className="pointer-events-none absolute inset-0 grid grid-cols-5 gap-1.5 sm:gap-2">
                  {[0, 1, 2, 3, 4].map((reel) => (
                    <div key={reel} className="relative">
                      {expand.reels.includes(reel) && (
                        <motion.div initial={{ scaleY: 0.33, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ duration: 0.45 }} className="absolute inset-0 overflow-hidden rounded-xl bg-[#1b1450] ring-2 ring-gold shadow-[0_0_30px_rgb(251_191_36/0.6)]">
                          <div className="absolute inset-x-[6%] top-1/2 aspect-square -translate-y-1/2"><Sym s={expand.sym} big /></div>
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>
              )} />
            <AnimatePresence>{banner && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/70 backdrop-blur-sm">{banner}</motion.div>
            )}</AnimatePresence>
            <WinOverlay show={!!big} mult={big?.mult ?? 0} amount={big?.amount ?? "0"} label={big?.label} onDone={() => bigDone.current()} />
          </div>
          {user ? (
            <SlotControls cfg={cfg} bet={bet} setBet={setBet} busy={busy} onSpin={() => void play(false)} onBuy={() => void play(true)} buyPrice={ATLAS.buyPrice}
              auto={auto} setAuto={setAuto} turbo={turbo} setTurbo={setTurbo} onInfo={() => setInfo(true)} accent={["#b5122f", "#ff6b7a"]} lastWin={lastWin} />
          ) : <PlayButton onClick={() => {}}>Войти</PlayButton>}
          <ErrorLine text={error} />
        </div>
      </div>
      <RoundsPanel slug="atlas" version={version} describe={describe} />
      <InfoModal open={info} onClose={() => setInfo(false)} title="Атлас звёзд — выплаты">
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
          <p><b className="text-gold">Атлас</b> — дикий символ и скаттер одновременно. 3, 4 или 5 атласов с надписью BONUS в любом месте платят 2×, 20× или 200× общей ставки и дают <b>10 бесплатных вращений</b>. Перед бонусом выбирается особый символ: во время бесплатных вращений он раскрывается на весь барабан и платит по всем 10 линиям, даже на несмежных барабанах.</p>
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
      <motion.div initial={{ rotateY: 180 }} animate={{ rotateY: 0 }} transition={{ duration: 0.8, delay: 0.3 }} className="relative size-28 rounded-2xl ring-4 ring-gold shadow-[0_0_40px_rgb(251_191_36/0.7)]"><Sym s={special} big /></motion.div>
      <p className="max-w-xs text-[13px] text-white/70">Раскрывается на весь барабан и платит по всем линиям</p>
    </motion.div>
  );
}
function Retrigger() {
  return <motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="font-display text-[28px] font-bold text-gold">+10 ВРАЩЕНИЙ!</motion.p>;
}

