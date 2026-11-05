"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { GAT, type GatResult, type GatSpin } from "@/lib/fair/slots3";
import { sfx } from "@/lib/sound";
import { ErrorLine, newKey, parsePoints, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "../kit";
import { BonusLabel, BonusTotal, DryCounter, InfoModal, SlotControls, sleep, useDrySpins, useSlotState, WinOverlay, winUnits, type BonusState } from "./SlotKit";

const NAMES: Record<string, string> = {
  cat: "Чёрный кот", owl: "Сова-звездочёт", hat: "Колпак мага", book: "Книга заклинаний",
  potion_gold: "Золотое зелье", potion_red: "Красное зелье", potion_green: "Зелёное зелье", potion_blue: "Синее зелье",
  portal: "Портал WILD", gate: "Врата BONUS", key: "Ключ",
};
const START: string[][] = [["potion_blue", "cat", "potion_green"], ["book", "gate", "potion_red"], ["owl", "portal", "potion_gold"], ["potion_green", "gate", "hat"], ["potion_red", "potion_blue", "cat"]];
let seq = 0;
type Col = { id: number; syms: string[] };
const toCols = (g: string[][]): Col[] => g.map((syms) => ({ id: ++seq, syms }));

export function GatSym({ s, big }: { s: string; big?: boolean }) {
  return (
    <>
      <Image src={`/img/ny/slots/gates/${s}.webp`} alt={NAMES[s] ?? s} fill sizes="90px" className={`rounded-lg object-cover ${s === "gate" ? "ring-2 ring-gold/80" : s === "portal" ? "ring-2 ring-[#c4b5fd]" : s === "key" ? "ring-2 ring-[#ffd166] shadow-[0_0_14px_#ffd166]" : ""}`} draggable={false} />
      {s === "gate" && !big && <BonusLabel />}
      {s === "portal" && !big && <span className="pointer-events-none absolute inset-x-0 bottom-[6%] mx-auto w-fit rounded-md bg-[linear-gradient(180deg,#e9d5ff,#8b5cf6)] px-1.5 font-display text-[clamp(7px,2vw,12px)] font-bold text-[#1e0b3a]">WILD</span>}
    </>
  );
}

const describe = (r: RoundView) => { const x = r.result as GatResult | null; if (!x) return "—"; const last = x.fs?.spins.at(-1); return x.fs ? `Бонус: ${x.fs.spins.length} вращений · до ${last ? last.ways.toLocaleString("ru-RU") : 243} способов${x.bought ? " (куплен)" : ""}` : x.base && x.base.mult > 0 ? `Выигрыш ${x.totalMult}×` : "Без выигрыша"; };

/** Барабаны разной высоты: чем выше барабан, тем меньше клетки и тем больше способов выиграть. */
function GateReels({ cols, hot, spinKey, turbo }: { cols: Col[]; hot: Set<string>; spinKey: number; turbo: boolean }) {
  return (
    <div className="grid aspect-[5/4.4] w-full grid-cols-5 gap-1.5 sm:gap-2" data-testid="gat-reels">
      {cols.map((c, reel) => (
        <motion.div key={reel} layout className="relative flex flex-col gap-1 overflow-hidden rounded-xl bg-black/35 p-1 ring-1 ring-white/10">
          {c.syms.map((s, row) => {
            const isHot = hot.has(`${reel}:${row}`);
            return (
              <motion.div key={`${c.id}-${row}`} initial={spinKey ? { y: "-260%", opacity: 0 } : false} animate={{ y: 0, opacity: 1, scale: isHot ? [1, 1.1, 1] : 1 }}
                transition={{ y: { duration: turbo ? 0.25 : 0.42, delay: (turbo ? 0.03 : 0.07) * reel + 0.03 * (c.syms.length - row), ease: [0.3, 0.9, 0.4, 1.08] }, scale: { duration: 0.5, repeat: isHot ? Infinity : 0 } }}
                className={`relative min-h-0 flex-1 rounded-lg ${isHot ? "ring-2 ring-white shadow-[0_0_16px_#c4b5fd]" : ""}`}>
                <div className="relative mx-auto aspect-square h-full max-w-full"><GatSym s={s} /></div>
              </motion.div>
            );
          })}
        </motion.div>
      ))}
    </div>
  );
}

export function GatesGame({ cfg }: { cfg: GameConfig }) {
  const { setBalance, balance, user } = useAuth();
  const { run, busy: reqBusy, error } = useGameRequest();
  const { bet, setBet, turbo, setTurbo, auto, setAuto } = useSlotState(cfg);
  const [cols, setCols] = useState<Col[]>(() => toCols(START));
  const [spinKey, setSpinKey] = useState(0);
  const [hot, setHot] = useState<Set<string>>(new Set());
  const [ways, setWays] = useState(243);
  const [winText, setWinText] = useState<string | null>(null);
  const [fs, setFs] = useState<BonusState | null>(null);
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [big, setBig] = useState<{ mult: number; amount: string; label?: string; short?: boolean } | null>(null);
  const { dry, prev, count } = useDrySpins("gates", !!user);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [version, setVersion] = useState(0);
  const bigDone = useRef<() => void>(() => {});
  const turboRef = useRef(turbo); turboRef.current = turbo;
  const t = (ms: number) => sleep(turboRef.current ? ms / 2 : ms);
  const showBig = (mult: number, amount: string, label?: string, short = false) => new Promise<void>((res) => { bigDone.current = () => { setBig(null); res(); }; setBig({ mult, amount, label, short }); });

  async function showSpin(s: GatSpin, units: bigint, inBonus: boolean) {
    setHot(new Set()); setWinText(null);
    setWays(s.ways); setCols(toCols(s.grid)); setSpinKey((k) => k + 1);
    sfx("whoosh"); for (let r = 0; r < GAT.reels; r++) sfx("reel", { i: r, delay: 300 + r * 90, pitch: 1 + r * 0.08 });
    await t(950);
    const cells = new Set(s.wins.flatMap((w) => w.cells));
    if (s.scatter.count >= 3) s.grid.forEach((col, reel) => col.forEach((x, row) => x === "gate" && cells.add(`${reel}:${row}`)));
    if (cells.size) {
      setHot(cells);
      const best = [...s.wins].sort((a, b) => b.mult - a.mult)[0];
      if (best) setWinText(`${NAMES[best.sym]} · ${best.count} барабана · ${best.ways.toLocaleString("ru-RU")} способ.${s.wins.length > 1 ? ` и ещё ${s.wins.length - 1}` : ""}`);
      sfx(s.mult >= 5 ? "bigwin" : s.scatter.count >= 3 && !s.wins.length ? "gem" : "win");
      if (!inBonus && s.mult > 0) setLastWin(winUnits(units, s.mult).toString());
      await t(1000);
    }
    // Ключи: каждый навсегда добавляет своему барабану ряд (со следующего вращения)
    if (inBonus && s.keys.length) {
      setHot(new Set(s.keys)); sfx("key"); sfx("upgrade", { delay: 250 });
      const grown = new Set(s.keys.map((k) => Number(k.split(":")[0])));
      setWinText(`Ключи открывают ${grown.size} ${grown.size === 1 ? "барабан" : "барабана"}: +${s.keys.length} ${s.keys.length === 1 ? "ряд" : "ряда"}`);
      await t(900);
    }
    await t(s.mult > 0 ? 250 : 120);
  }

  async function play(buy: boolean): Promise<boolean> {
    const units = parsePoints(bet) ?? 0n;
    setPlaying(true); setLastWin(null); setHot(new Set()); setWinText(null);
    const r = await run<{ round: RoundView; balance: string }>("/api/games/gates/bet", { amount: bet, params: { buy }, key: newKey() }, { deferBalance: true });
    if (!r) { setPlaying(false); return false; }
    setBalance((BigInt(balance) - BigInt(r.round.bet)).toString());
    const res = r.round.result as unknown as GatResult;
    if (res.base) await showSpin(res.base, units, false);
    if (!res.bought) count(!!res.fs);
    if (res.fs) {
      const f = res.fs;
      sfx("bonus"); sfx("harp", { delay: 300 }); setBanner(<Intro />); await sleep(3000); setBanner(null);
      const cap = winUnits(units, GAT.maxWin);
      let total = res.base ? winUnits(units, res.base.mult) : 0n; let left = GAT.freeSpins; let tick = 0;
      for (let i = 0; i < f.spins.length; i++) {
        const s = f.spins[i]!; left--;
        setFs({ left, done: i + 1, total: total.toString(), add: null, tick });
        await showSpin(s, units, true);
        const add = winUnits(units, s.mult);
        if (add > 0n) { total = total + add > cap ? cap : total + add; tick++; }
        setFs({ left, done: i + 1, total: total.toString(), add: add > 0n ? add.toString() : null, tick });
        setLastWin(total.toString());
        if (s.mult >= 10) await showBig(s.mult, add.toString(), `Вращение ${i + 1} · ${s.ways.toLocaleString("ru-RU")} способов`, true);
        if (s.scatter.count >= 3) { sfx("bonus"); left += GAT.retrigger; setBanner(<motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="font-display text-[28px] font-bold text-[#e9d5ff]">+{GAT.retrigger} ВРАЩЕНИЙ!</motion.p>); await sleep(1400); setBanner(null); }
      }
      await showBig(res.totalMult, r.round.payout, `Бонус: ${f.spins.length} вращений · до ${(f.spins.at(-1)?.ways ?? 243).toLocaleString("ru-RU")} способов`);
      setFs(null); setWays(243);
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
      <div className="slot-cabinet relative overflow-hidden rounded-[28px] ring-1 ring-white/10" style={{ boxShadow: "0 30px 80px -40px #a78bfa" }}><div className="ornate-frame" aria-hidden />
        <Image src="/img/ny/bg/gates.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a0b3a]/45 via-[#120a2e]/35 to-[#070b1f]/92" />
        <div className="relative mx-auto grid max-w-[700px] gap-4 p-3 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-[clamp(20px,4vw,30px)] font-bold tracking-wide text-[#efe6ff] drop-shadow-[0_2px_14px_rgb(167_139_250/0.9)]">✨ ЗВЁЗДНЫЕ ВРАТА</h2>
            <motion.span key={ways} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="rounded-xl bg-black/55 px-3 py-1 font-mono text-[14px] font-bold text-[#e9d5ff] ring-1 ring-[#a78bfa]/50" data-testid="gat-ways">{ways.toLocaleString("ru-RU")} способов</motion.span>
          </div>
          <BonusTotal state={fs} color="#a78bfa" title="✨ Врата открыты" sub={fs ? "Ключи навсегда растят барабаны — до 7 рядов и 16 807 способов" : undefined} />
          <div className="snow-cap relative rounded-2xl bg-[linear-gradient(180deg,#3b1d6e,#170a33)] p-2 shadow-[inset_0_0_0_2px_rgb(233_213_255/0.55),0_20px_50px_-20px_#000] sm:p-3">
            <GateReels cols={cols} hot={hot} spinKey={spinKey} turbo={turbo || !!fs} />
            <AnimatePresence>{winText && (
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-0 -bottom-1 z-10 mx-auto w-fit max-w-[95%] rounded-full bg-black/75 px-3 py-1 text-center text-[12.5px] font-semibold text-[#efe6ff] ring-1 ring-[#a78bfa]/40">{winText}</motion.p>
            )}</AnimatePresence>
            <AnimatePresence>{banner && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/80">{banner}</motion.div>
            )}</AnimatePresence>
            <WinOverlay show={!!big} mult={big?.mult ?? 0} amount={big?.amount ?? "0"} label={big?.label} short={big?.short} onDone={() => bigDone.current()} />
          </div>
          <DryCounter dry={dry} prev={prev} avg={230} />
          {user ? (
            <SlotControls cfg={cfg} bet={bet} setBet={setBet} busy={busy} onSpin={() => void play(false)} onBuy={() => void play(true)} buyPrice={GAT.buyPrice}
              auto={auto} setAuto={setAuto} turbo={turbo} setTurbo={setTurbo} onInfo={() => setInfo(true)} accent={["#6d28d9", "#c4b5fd"]} lastWin={lastWin} />
          ) : <PlayButton onClick={() => {}}>Войти</PlayButton>}
          <ErrorLine text={error} />
        </div>
      </div>
      <RoundsPanel slug="gates" version={version} describe={describe} />
      <InfoModal open={info} onClose={() => setInfo(false)} title="Звёздные врата — выплаты">
        <p>5 барабанов, выигрыш — одинаковые символы на соседних барабанах начиная с левого, в любых рядах (способы). Портал — дикий символ на барабанах 2–5. Числа — во сколько раз выигрыш больше общей ставки за один способ на 3 / 4 / 5 барабанах.</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.keys(GAT.pays).map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-xl bg-ink p-2">
              <span className="relative size-12 shrink-0"><GatSym s={s} big /></span>
              <span className="font-mono text-[12px]">{GAT.pays[s]!.map((v, i) => <span key={i} className="block">{i + 3} — {v}×</span>)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3">
          <span className="relative size-14 shrink-0"><GatSym s="key" big /></span>
          <p><b className="text-[#c4b5fd]">Ключи от врат.</b> 3, 4 или 5 врат BONUS платят {GAT.scatterPays[3]}×, {GAT.scatterPays[4]}× или {GAT.scatterPays[5]}× ставки и дают <b>{GAT.freeSpins} бесплатных вращений</b>. В бонусе выпадают ключи: каждый ключ <b>навсегда добавляет своему барабану ряд</b> — от 3 до 7. Способов выиграть становится всё больше: с 243 до <b>16 807</b>. 3 врат в бонусе — ещё +{GAT.retrigger}.</p>
        </div>
        <p>«Купить бонус» — {GAT.buyPrice}× ставки. Максимальный выигрыш — {GAT.maxWin.toLocaleString("ru-RU")}× ставки. Расчётный RTP ≈ 96%. Каждый раунд проверяется на странице «Честность».</p>
      </InfoModal>
    </div>
  );
}

function Intro() {
  return (
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="grid place-items-center gap-3 p-4 text-center">
      <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.6, repeat: Infinity }} className="relative size-24 rounded-2xl ring-4 ring-[#c4b5fd] shadow-[0_0_50px_#a78bfa]"><GatSym s="gate" big /></motion.div>
      <p className="font-display text-[clamp(20px,5vw,34px)] font-bold text-[#efe6ff]">{GAT.freeSpins} БЕСПЛАТНЫХ ВРАЩЕНИЙ</p>
      <p className="max-w-xs text-[13.5px] text-white/80">Ловите ключи — каждый навсегда растит свой барабан, а способов выиграть становится до 16 807</p>
    </motion.div>
  );
}
