"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { anticipationFrom } from "@/lib/fair/slots";
import { SAL, type Rocket, type SalResult, type SalSpin } from "@/lib/fair/slots2";
import { sfx } from "@/lib/sound";
import { ErrorLine, newKey, parsePoints, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "../kit";
import { BonusLabel, BonusTotal, DryCounter, InfoModal, Reels, SlotControls, sleep, useDrySpins, useSlotState, WinOverlay, winUnits, type BonusState } from "./SlotKit";

const NAMES: Record<string, string> = { deer: "Олень", snowman: "Снеговик", lantern: "Фонарик", bell: "Бубенец", popper: "Хлопушка", tangerine: "Мандарин", rocket: "Ракета", firebox: "Салют" };
const PAYING = ["tangerine", "popper", "bell", "lantern", "snowman", "deer"];
const randomSym = () => { const x = Math.random(); return x < 0.04 ? "firebox" : x < 0.07 ? "rocket" : PAYING[Math.floor(Math.random() * PAYING.length)]!; };
const START: string[][] = [["deer", "bell", "tangerine", "popper"], ["lantern", "rocket", "snowman", "bell"], ["firebox", "tangerine", "deer", "lantern"], ["popper", "snowman", "rocket", "tangerine"], ["bell", "lantern", "popper", "deer"]];
const COLORS = ["#ffd166", "#ff5f6f", "#8fdcff", "#3ee08f", "#c084fc"];

export function SalSym({ s, big }: { s: string; big?: boolean }) {
  return (
    <>
      <Image src={`/img/verdant/slots/salute/${s}.webp`} alt={NAMES[s] ?? s} fill sizes="110px" className={`rounded-lg object-cover ${s === "firebox" ? "ring-2 ring-gold/70" : s === "rocket" ? "ring-2 ring-[#ff5f6f]/80" : ""}`} draggable={false} />
      {s === "firebox" && !big && <BonusLabel />}
    </>
  );
}

const describe = (r: RoundView) => { const x = r.result as SalResult | null; if (!x) return "—"; return x.fs ? `Бонус: ${x.fs.spins.length} вращений${x.bought ? " (куплен)" : ""}` : x.base && x.base.mult > 0 ? `Выигрыш ${x.totalMult}×` : "Без выигрыша"; };

/** Ракеты поверх барабанов 5×4: плавно поднимаются на ряд (layout-анимация), над полем — салют. */
function RocketLayer({ rockets, bursts }: { rockets: Rocket[]; bursts: { id: number; reel: number; key: number }[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid grid-cols-5 grid-rows-4 gap-x-1.5 sm:gap-x-2">
      <AnimatePresence>
        {rockets.map((r) => (
          <motion.div key={r.id} layout transition={{ layout: { duration: 0.55, ease: [0.3, 0.7, 0.3, 1] } }} initial={{ scale: 0.3, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ opacity: 0, y: -60, scale: 0.6 }}
            className="relative z-10 rounded-xl bg-[#1a0b1f] p-[5%] ring-2 ring-[#ff5f6f] shadow-[0_0_24px_#ff5f6f]" style={{ gridColumn: r.reel + 1, gridRow: r.row + 1 }} data-testid="rocket">
            <div className="relative size-full"><SalSym s="rocket" big /></div>
            {r.x > 1 && <span className="absolute -right-1 -top-1 rounded-lg bg-[linear-gradient(180deg,#fde68a,#f59e0b)] px-1.5 font-display text-[clamp(11px,2.6vw,16px)] font-bold text-[#3a2300] shadow">×{r.x}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
      {/* Салют: искры разлетаются над тем барабаном, с которого улетела ракета */}
      {bursts.map((b) => (
        <div key={b.key} className="absolute top-0 z-20" style={{ left: `${b.reel * 20 + 10}%` }}>
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2; const c = COLORS[(i + b.reel) % COLORS.length];
            return <motion.span key={i} initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: Math.cos(a) * 70, y: Math.sin(a) * 70 - 20, opacity: 0, scale: 0.4 }} transition={{ duration: 1.1, ease: "easeOut" }}
              className="absolute size-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />;
          })}
        </div>
      ))}
    </div>
  );
}

export function SaluteGame({ cfg }: { cfg: GameConfig }) {
  const { setBalance, balance, user } = useAuth();
  const { run, busy: reqBusy, error } = useGameRequest();
  const { bet, setBet, turbo, setTurbo, auto, setAuto } = useSlotState(cfg);
  const [grid, setGrid] = useState<string[][]>(START);
  const [spinKey, setSpinKey] = useState(0);
  const [hl, setHl] = useState<Set<string> | null>(null);
  const [rockets, setRockets] = useState<Rocket[]>([]);
  const [bursts, setBursts] = useState<{ id: number; reel: number; key: number }[]>([]);
  const [winText, setWinText] = useState<string | null>(null);
  const [fs, setFs] = useState<BonusState | null>(null);
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [big, setBig] = useState<{ mult: number; amount: string; label?: string; short?: boolean } | null>(null);
  const { dry, prev, count } = useDrySpins("salute", !!user);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [version, setVersion] = useState(0);
  const [slowFrom, setSlowFrom] = useState<number | null>(null);
  const stop = useRef<() => void>(() => {});
  const bigDone = useRef<() => void>(() => {});
  const turboRef = useRef(turbo); turboRef.current = turbo;
  const t = (ms: number) => sleep(turboRef.current ? ms / 2 : ms);

  const spinTo = useCallback((g: string[][]) => new Promise<void>((res) => { stop.current = res; setHl(null); setWinText(null); setSlowFrom(anticipationFrom(g, "firebox")); setGrid(g); setSpinKey((k) => k + 1); }), []);
  const showBig = (mult: number, amount: string, label?: string, short = false) => new Promise<void>((res) => { bigDone.current = () => { setBig(null); res(); }; setBig({ mult, amount, label, short }); });

  async function showSpin(s: SalSpin, units: bigint, inBonus: boolean, keep: Rocket[]) {
    // «Шагающие» ракеты остаются на поле во время раскрутки, новые появляются после остановки
    setRockets(keep);
    await spinTo(s.grid);
    const fresh = s.rockets.filter((r) => !keep.some((k) => k.id === r.id));
    fresh.forEach((_, i) => sfx("whistle", { delay: i * 120 }));
    setRockets(s.rockets);
    if (fresh.length) await t(450);
    const cells = new Set(s.wins.flatMap((w) => w.cells));
    if (s.scatter.count >= 3) s.grid.forEach((col, r) => col.forEach((x, row) => x === "firebox" && cells.add(`${r}:${row}`)));
    setHl(cells.size ? cells : null);
    if (s.wins.length) {
      const best = [...s.wins].sort((a, b) => b.mult - a.mult)[0]!;
      setWinText(`${NAMES[best.sym]} ×${best.count} · ${best.ways} ${best.ways === 1 ? "способ" : best.ways < 5 ? "способа" : "способов"}${s.wins.length > 1 ? ` и ещё ${s.wins.length - 1}` : ""}`);
    }
    if (s.mult > 0 && s.mult < 10) sfx(s.mult >= 3 ? "bigwin" : "win");
    if (s.mult > 0 && !inBonus) setLastWin(winUnits(units, s.mult).toString());
    await t(s.mult > 0 ? 1000 : 250);
  }

  async function play(buy: boolean): Promise<boolean> {
    const units = parsePoints(bet) ?? 0n;
    setPlaying(true); setLastWin(null); setHl(null); setWinText(null);
    const r = await run<{ round: RoundView; balance: string }>("/api/games/salute/bet", { amount: bet, params: { buy }, key: newKey() }, { deferBalance: true });
    if (!r) { setPlaying(false); return false; }
    setBalance((BigInt(balance) - BigInt(r.round.bet)).toString());
    const res = r.round.result as unknown as SalResult;
    if (res.base) await showSpin(res.base, units, false, []);
    if (!res.bought) count(!!res.fs);
    if (res.fs) {
      const f = res.fs;
      sfx("bonus"); sfx("firework", { delay: 400 }); setBanner(<Intro />); await sleep(2800); setBanner(null);
      setRockets([]);
      let total = res.base ? winUnits(units, res.base.mult) : 0n; let left = SAL.freeSpins; let tick = 0; let prevIds = new Set<number>();
      for (let i = 0; i < f.spins.length; i++) {
        const s = f.spins[i]!; left--;
        setFs({ left, done: i + 1, total: total.toString(), add: null, tick });
        // 1) ракеты поднимаются на ряд, улетевшие за край взрываются салютом
        const keep = s.rockets.filter((x) => prevIds.has(x.id));
        if (keep.length || s.burst.length) {
          setHl(null); setRockets(keep); keep.forEach((_, k) => sfx("whistle", { delay: k * 60 }));
          if (s.burst.length) {
            setBursts(s.burst.map((b, k) => ({ id: b.id, reel: b.reel, key: Date.now() + k })));
            s.burst.forEach((_, k) => sfx("firework", { delay: 150 + k * 180 }));
          }
          await t(s.burst.length ? 900 : 600); setBursts([]);
        }
        // 2) вращение
        await showSpin(s, units, true, keep);
        prevIds = new Set(s.rockets.map((x) => x.id));
        const add = winUnits(units, s.mult);
        if (add > 0n) { total += add; tick++; sfx("coin"); }
        setFs({ left, done: i + 1, total: total.toString(), add: add > 0n ? add.toString() : null, tick });
        setLastWin(total.toString());
        if (s.mult >= 10) await showBig(s.mult, add.toString(), `Вращение ${i + 1}`, true);
        if (s.trigger) { sfx("bonus"); left += SAL.retrigger; setBanner(<motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="font-display text-[28px] font-bold text-gold">+{SAL.retrigger} ВРАЩЕНИЯ!</motion.p>); await sleep(1400); setBanner(null); }
      }
      // Финальный залп: все оставшиеся ракеты взлетают
      const last = f.spins.at(-1)?.rockets ?? [];
      if (last.length) { setRockets([]); setBursts(last.map((b, k) => ({ id: b.id, reel: b.reel, key: Date.now() + k }))); last.forEach((_, k) => sfx("firework", { delay: k * 160 })); await sleep(1200); setBursts([]); }
      await showBig(res.totalMult, r.round.payout, `Бонус: ${f.spins.length} вращений`);
      setFs(null); setRockets([]);
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
      <div className="relative overflow-hidden rounded-[28px] ring-1 ring-white/10" style={{ boxShadow: "0 30px 80px -40px #ff5f6f" }}>
        <Image src="/img/verdant/bg/salute.webp" alt="" fill priority sizes="100vw" className="object-cover object-[78%_center]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a0614]/40 via-[#0b0716]/30 to-[#070b1f]/92" />
        <div className="relative mx-auto grid max-w-[720px] gap-4 p-3 sm:p-6">
          <h2 className="font-display text-[clamp(20px,4vw,30px)] font-bold tracking-wide text-gold drop-shadow-[0_2px_14px_rgb(255_95_111/0.9)]">✦ NEON BURST</h2>
          <BonusTotal state={fs} color="#ff8a9a" title="🎆 Салют" sub={fs ? `Ракет на поле: ${rockets.length}` : undefined} />
          <div className="snow-cap relative rounded-2xl bg-[linear-gradient(180deg,#3a0f2e,#120818)] p-2 shadow-[inset_0_0_0_2px_rgb(255_209_102/0.5),0_20px_50px_-20px_#000] sm:p-3">
            <Reels grid={grid} rows={4} spinKey={spinKey} turbo={turbo || !!fs} filler={randomSym} onStopped={() => stop.current()} slowFrom={slowFrom}
              render={(c) => <SalSym s={c} />} highlight={hl} sound={{ spin: "spin", stop: "pop" }}
              overlay={<RocketLayer rockets={rockets} bursts={bursts} />} />
            <AnimatePresence>{winText && (
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-0 -bottom-1 z-10 mx-auto w-fit rounded-full bg-black/70 px-3 py-1 text-[12.5px] font-semibold text-gold ring-1 ring-gold/40">{winText}</motion.p>
            )}</AnimatePresence>
            <AnimatePresence>{banner && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center rounded-2xl bg-black/75">{banner}</motion.div>
            )}</AnimatePresence>
            <WinOverlay show={!!big} mult={big?.mult ?? 0} amount={big?.amount ?? "0"} label={big?.label} short={big?.short} onDone={() => bigDone.current()} />
          </div>
          <DryCounter dry={dry} prev={prev} avg={190} />
          {user ? (
            <SlotControls cfg={cfg} bet={bet} setBet={setBet} busy={busy} onSpin={() => void play(false)} onBuy={() => void play(true)} buyPrice={SAL.buyPrice}
              auto={auto} setAuto={setAuto} turbo={turbo} setTurbo={setTurbo} onInfo={() => setInfo(true)} accent={["#be123c", "#ff5f6f"]} lastWin={lastWin} />
          ) : <PlayButton onClick={() => {}}>Войти</PlayButton>}
          <ErrorLine text={error} />
        </div>
      </div>
      <RoundsPanel slug="salute" version={version} describe={describe} />
      <InfoModal open={info} onClose={() => setInfo(false)} title="Neon Burst — выплаты">
        <p><b>1024 способа выиграть</b>: линий нет — платят одинаковые символы на соседних барабанах, начиная с первого слева, в любых рядах. Числа — во сколько раз выигрыш больше общей ставки за каждый способ.</p>
        <div className="grid grid-cols-2 gap-2">
          {["deer", "snowman", "lantern", "bell", "popper", "tangerine"].map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-xl bg-ink p-2">
              <span className="relative size-12 shrink-0"><SalSym s={s} big /></span>
              <span className="font-mono text-[12px]">{[5, 4, 3].map((n) => <span key={n} className="block">{n}× — {SAL.pays[s]![n - 3]}</span>)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3">
          <span className="relative size-14 shrink-0"><SalSym s="rocket" big /></span>
          <p><b className="text-[#ff8a9a]">Ракета</b> — дикий символ на барабанах 2–5, заменяет любой символ. Ракета может прилететь с множителем ×2 или ×3 — он умножает все способы, проходящие через неё.</p>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3">
          <span className="relative size-14 shrink-0"><SalSym s="firebox" big /></span>
          <p><b className="text-gold">Салют</b>: 3, 4 или 5 в любом месте платят {SAL.scatterPays[3]}×, {SAL.scatterPays[4]}× или {SAL.scatterPays[5]}× ставки и дают <b>{SAL.freeSpins} бесплатных вращений</b>. В бонусе ракеты не исчезают: каждое вращение каждая ракета <b>поднимается на ряд вверх</b>, пока не вылетит за край и не взорвётся салютом. Множители ракет в бонусе — ×2, ×3, ×5 и ×10. 3 салюта — ещё +{SAL.retrigger}.</p>
        </div>
        <p>«Купить бонус» — {SAL.buyPrice}× ставки. Максимальный выигрыш — {SAL.maxWin.toLocaleString("ru-RU")}× ставки. Расчётный RTP ≈ 95,5%. Каждый раунд проверяется на странице «Честность».</p>
      </InfoModal>
    </div>
  );
}

function Intro() {
  return (
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="grid place-items-center gap-3 p-4 text-center">
      <motion.div animate={{ y: [0, -14, 0] }} transition={{ duration: 1.2, repeat: Infinity }} className="relative size-24 rounded-2xl ring-4 ring-[#ff5f6f] shadow-[0_0_50px_#ff5f6f]"><SalSym s="rocket" big /></motion.div>
      <p className="font-display text-[clamp(20px,5vw,34px)] font-bold text-gold">{SAL.freeSpins} БЕСПЛАТНЫХ ВРАЩЕНИЙ</p>
      <p className="max-w-xs text-[13.5px] text-white/80">Ракеты остаются на поле и каждое вращение поднимаются на ряд — а у края взрываются салютом</p>
    </motion.div>
  );
}
