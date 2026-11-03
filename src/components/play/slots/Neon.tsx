"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { NEON, type NeonCell, type NeonFeature, type NeonResult, type NeonSpin } from "@/lib/fair/slots";
import { ErrorLine, newKey, parsePoints, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "../kit";
import { InfoModal, Reels, SlotControls, sleep, useSlotState, WinOverlay, winCells, type LineWin } from "./SlotKit";

const SYMS = ["cherry", "lemon", "plum", "watermelon", "strawberry", "seven", "joker", "crystal", "coin"];
const NAMES: Record<string, string> = { cherry: "Вишня", lemon: "Лимон", plum: "Слива", watermelon: "Арбуз", strawberry: "Клубника", seven: "Семёрка", joker: "Джокер", crystal: "Кристалл", coin: "Монета" };
const COIN_VALUES = [0.5, 1, 2, 3, 5];
const randomCell = (): NeonCell => { const sym = SYMS[Math.floor(Math.random() * 7)]!; return Math.random() < 0.05 ? { sym: "coin", value: COIN_VALUES[Math.floor(Math.random() * 5)] } : { sym }; };
const START: NeonCell[][] = [
  [{ sym: "cherry" }, { sym: "seven" }, { sym: "lemon" }, { sym: "plum" }], [{ sym: "watermelon" }, { sym: "joker" }, { sym: "cherry" }, { sym: "coin", value: 2 }],
  [{ sym: "seven" }, { sym: "crystal" }, { sym: "strawberry" }, { sym: "lemon" }], [{ sym: "plum" }, { sym: "seven" }, { sym: "watermelon" }, { sym: "cherry" }],
  [{ sym: "strawberry" }, { sym: "lemon" }, { sym: "coin", value: 5 }, { sym: "seven" }],
];
const BLANK: NeonCell = { sym: "blank" };
type CollectData = Pick<Extract<NeonFeature, { type: "collect" }>, "steps" | "coins">;

const CAPS = [
  { type: "chests", name: "Сундуки", color: "#fbbf24", icon: "🎁" },
  { type: "boost", name: "Буст", color: "#fb923c", icon: "⚡" },
  { type: "collect", name: "Сбор", color: "#35f08c", icon: "💰" },
  { type: "mega", name: "Мега", color: "#ec4899", icon: "🌟" },
  { type: "jackpot", name: "Джекпот", color: "#22d3ee", icon: "👑" },
] as const;

function Cell({ c }: { c: NeonCell }) {
  if (c.sym === "blank") return <span className="block size-full rounded-lg bg-white/[0.03]" />;
  return (
    <span className="relative block size-full">
      <Image src={`/img/slots/neon/${c.sym}.webp`} alt={NAMES[c.sym] ?? c.sym} fill sizes="110px" className="rounded-lg object-cover" draggable={false} />
      {c.sym === "coin" && c.value !== undefined && (
        <span className="absolute inset-x-0 bottom-[8%] mx-auto w-fit rounded-md bg-black/75 px-1.5 font-mono text-[clamp(10px,2.4vw,14px)] font-bold text-gold ring-1 ring-gold/60">{c.value}×</span>
      )}
    </span>
  );
}

const describe = (r: RoundView) => {
  const x = r.result as NeonResult | null; if (!x) return "—";
  const f = x.feature ? CAPS.find((c) => c.type === x.feature!.type)?.name : null;
  return f ? `Бонус «${f}»${x.bought ? " (куплен)" : ""} · ${x.totalMult}×` : x.totalMult > 0 ? `Выигрыш ${x.totalMult}×` : "Без выигрыша";
};

export function NeonGame({ cfg }: { cfg: GameConfig }) {
  const { setBalance, balance, user } = useAuth();
  const { run, busy: reqBusy, error } = useGameRequest();
  const { bet, setBet, turbo, setTurbo, auto, setAuto } = useSlotState(cfg);
  const [grid, setGrid] = useState<NeonCell[][]>(START);
  const [spinKey, setSpinKey] = useState(0);
  const [lines, setLines] = useState<LineWin[]>([]);
  const [hl, setHl] = useState<Set<string> | null>(null);
  const [cap, setCap] = useState<string | null>(null);
  const [status, setStatus] = useState<React.ReactNode>(null);
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [big, setBig] = useState<{ mult: number; amount: string; label?: string } | null>(null);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [version, setVersion] = useState(0);
  const stop = useRef<() => void>(() => {});
  const bigDone = useRef<() => void>(() => {});
  const turboRef = useRef(turbo); turboRef.current = turbo;
  const t = (ms: number) => sleep(turboRef.current ? ms / 2 : ms);

  const spinTo = useCallback((g: NeonCell[][]) => new Promise<void>((res) => { stop.current = res; setHl(null); setLines([]); setGrid(g); setSpinKey((k) => k + 1); }), []);
  const showBig = (mult: number, amount: string, label?: string) => new Promise<void>((res) => { bigDone.current = () => { setBig(null); res(); }; setBig({ mult, amount, label }); });

  async function showSpin(s: NeonSpin, units: bigint, extra?: Set<string>) {
    await spinTo(s.grid);
    const cells = winCells(s.wins, NEON.lines); extra?.forEach((c) => cells.add(c));
    setLines(s.wins); setHl(cells.size ? cells : null);
    if (s.mult > 0) setLastWin(((units * BigInt(Math.round(s.mult * 10000))) / 10000n).toString());
    await t(s.mult > 0 ? 1000 : 250);
  }

  async function chooseCapsule(type: string) {
    setBanner(<p className="font-display text-[clamp(22px,5vw,36px)] font-bold text-gradient">БОНУС!</p>); await t(900); setBanner(null);
    // «Рулетка» по капсулам с замедлением
    const idx = CAPS.findIndex((c) => c.type === type); const steps = 10 + idx;
    for (let i = 0; i <= steps; i++) { setCap(CAPS[i % CAPS.length]!.type); await sleep(70 + i * 18); }
    await t(600);
  }

  async function runCollect(c: CollectData) {
    const initial = c.coins.slice(0, c.coins.length - c.steps.reduce((s, x) => s + x.added.length, 0));
    const g: NeonCell[][] = Array.from({ length: 5 }, () => Array.from({ length: 4 }, () => BLANK));
    for (const k of initial) g[k.reel]![k.row] = { sym: "coin", value: k.value };
    setHl(null); setLines([]); setGrid(g.map((col) => [...col]));
    let lives = 3; let sum = initial.reduce((s, k) => s + k.value, 0);
    setStatus(<CollectStatus lives={lives} sum={sum} />); await t(900);
    for (const st of c.steps) {
      for (const k of st.added) g[k.reel]![k.row] = { sym: "coin", value: k.value };
      sum += st.added.reduce((s, k) => s + k.value, 0);
      lives = st.added.length ? 3 : lives - 1;
      setGrid(g.map((col) => [...col])); setHl(st.added.length ? new Set(st.added.map((k) => `${k.reel}:${k.row}`)) : null);
      setStatus(<CollectStatus lives={lives} sum={sum} />); await t(st.added.length ? 900 : 600);
    }
    await t(500); setStatus(null);
  }

  async function play(buy: boolean): Promise<boolean> {
    const units = parsePoints(bet) ?? 0n;
    setPlaying(true); setLastWin(null); setCap(null); setHl(null); setLines([]);
    const r = await run<{ round: RoundView; balance: string }>("/api/games/neon-garden/bet", { amount: bet, params: { buy }, key: newKey() }, { deferBalance: true });
    if (!r) { setPlaying(false); return false; }
    setBalance((BigInt(balance) - BigInt(r.round.bet)).toString());
    const res = r.round.result as unknown as NeonResult;
    if (res.base) {
      const crystals = new Set<string>();
      if (res.crystals >= 3) res.base.grid.forEach((col, reel) => col.forEach((x, row) => x.sym === "crystal" && crystals.add(`${reel}:${row}`)));
      await showSpin(res.base, units, crystals);
    }
    const f = res.feature;
    if (f) {
      await chooseCapsule(f.type);
      if (f.type === "chests") { setBanner(<Chests values={f.values} />); await sleep(3400); setBanner(null); }
      if (f.type === "jackpot") { setBanner(<Jackpot level={f.level} />); await sleep(3000); setBanner(null); }
      if (f.type === "boost" || f.type === "mega") {
        setBanner(<p className="font-display text-[clamp(26px,6vw,44px)] font-bold text-[#fb923c] drop-shadow-[0_0_20px_#fb923c]">БУСТ ×{f.x}</p>); await t(1300); setBanner(null);
        let sum = 0;
        for (let i = 0; i < f.spins.length; i++) {
          setStatus(<span>Буст ×{f.x} · вращение {i + 1}/{f.spins.length} · <b className="text-gold">{sum.toFixed(2)}×</b></span>);
          await showSpin(f.spins[i]!, units); sum += f.spins[i]!.mult;
        }
        setStatus(null);
      }
      if (f.type === "collect") await runCollect(f);
      if (f.type === "mega") await runCollect(f.collect);
      await showBig(res.totalMult, r.round.payout, `Бонус «${CAPS.find((c) => c.type === f.type)!.name}»`);
      setCap(null);
    } else if (res.totalMult >= 10) await showBig(res.totalMult, r.round.payout);
    setLastWin(r.round.payout);
    setBalance(r.balance); setVersion((v) => v + 1); setPlaying(false);
    return !f;
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
      <div className="relative overflow-hidden rounded-[28px] ring-1 ring-white/10" style={{ boxShadow: "0 30px 80px -40px #ff3ea5" }}>
        <Image src="/img/bg/neon-garden.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c0a1d]/50 via-[#0c0a1d]/30 to-[#0c0a1d]/90" />
        <div className="relative mx-auto grid max-w-[720px] gap-3 p-3 sm:p-6">
          <h2 className="text-center font-display text-[clamp(22px,4.6vw,34px)] font-bold tracking-wide text-[#ff7ac6] drop-shadow-[0_0_14px_#ff3ea5]">НЕОНОВЫЙ САД</h2>
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {CAPS.map((c) => {
              const on = cap === c.type;
              return (
                <motion.div key={c.type} animate={on ? { y: -6, scale: 1.06 } : { y: 0, scale: 1 }} className="grid place-items-center rounded-2xl px-1 py-2 text-center ring-1"
                  style={{ background: on ? `linear-gradient(180deg, ${c.color}, ${c.color}55)` : "rgb(0 0 0 / 0.45)", borderColor: c.color, boxShadow: on ? `0 0 26px ${c.color}` : `inset 0 0 0 1px ${c.color}66`, color: on ? "#140a20" : c.color }}>
                  <span className="text-[clamp(16px,4vw,24px)]" aria-hidden>{c.icon}</span>
                  <span className="text-[clamp(9px,2.2vw,12px)] font-extrabold uppercase tracking-wide">{c.name}</span>
                </motion.div>
              );
            })}
          </div>
          <div className="relative rounded-2xl bg-[linear-gradient(180deg,#26103d,#0f0820)] p-2 shadow-[inset_0_0_0_2px_rgb(255_62_165/0.5),0_20px_50px_-20px_#000] sm:p-3">
            <Reels grid={grid} rows={4} spinKey={spinKey} turbo={turbo} filler={randomCell} onStopped={() => stop.current()}
              render={(c) => <Cell c={c} />} highlight={hl} lines={lines} linePatterns={NEON.lines} />
            <AnimatePresence>{banner && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/75 p-3 backdrop-blur-sm">{banner}</motion.div>
            )}</AnimatePresence>
            <WinOverlay show={!!big} mult={big?.mult ?? 0} amount={big?.amount ?? "0"} label={big?.label} onDone={() => bigDone.current()} />
          </div>
          <AnimatePresence>{status && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl bg-black/50 px-3 py-2 text-center text-[14px]">{status}</motion.p>}</AnimatePresence>
          {user ? (
            <SlotControls cfg={cfg} bet={bet} setBet={setBet} busy={busy} onSpin={() => void play(false)} onBuy={() => void play(true)} buyPrice={NEON.buyPrice}
              auto={auto} setAuto={setAuto} turbo={turbo} setTurbo={setTurbo} onInfo={() => setInfo(true)} accent={["#be185d", "#ff7ac6"]} lastWin={lastWin} />
          ) : <PlayButton onClick={() => {}}>Войти</PlayButton>}
          <ErrorLine text={error} />
        </div>
      </div>
      <RoundsPanel slug="neon-garden" version={version} describe={describe} />
      <InfoModal open={info} onClose={() => setInfo(false)} title="Неоновый сад — выплаты">
        <p>25 фиксированных линий, ставка делится на 25. Выплата — за 3–5 одинаковых символов слева направо (числа — во сколько раз больше ставки на линию).</p>
        <div className="grid grid-cols-2 gap-2">
          {(["seven", "strawberry", "watermelon", "plum", "lemon", "cherry"] as const).map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-xl bg-ink p-2">
              <span className="relative size-12 shrink-0"><Cell c={{ sym: s }} /></span>
              <span className="font-mono text-[12px]">{Object.entries(NEON.pays[s]!).reverse().map(([n, v]) => <span key={n} className="block">{n}× — {v}</span>)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3"><span className="relative size-12 shrink-0"><Cell c={{ sym: "joker" }} /></span><p><b>Джокер</b> появляется на барабанах 2–4 и заменяет любой фрукт и семёрку.</p></div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3"><span className="relative size-12 shrink-0"><Cell c={{ sym: "crystal" }} /></span><p><b>3+ кристалла</b> запускают один из пяти бонусов:</p></div>
        <ul className="grid gap-1.5">
          <li>🎁 <b>Сундуки</b> — три сундука с призами от 2× до 50× ставки.</li>
          <li>⚡ <b>Буст</b> — 5 вращений с множителем ×2, ×3, ×5 или ×10 на все выигрыши.</li>
          <li>💰 <b>Сбор</b> — монеты фиксируются на поле, 3 повторных вращения; каждая новая монета возвращает счётчик к 3. Платится сумма всех монет.</li>
          <li>🌟 <b>Мега</b> — Буст и Сбор подряд.</li>
          <li>👑 <b>Джекпот</b> — Мини 20×, Мажор 100× или Гранд 1000× ставки.</li>
        </ul>
        <p>«Купить бонус» — случайный бонус за {NEON.buyPrice}× ставки. Максимальный выигрыш — {NEON.maxWin.toLocaleString("ru-RU")}× ставки. Расчётный RTP ≈ 95%.</p>
      </InfoModal>
    </div>
  );
}

function CollectStatus({ lives, sum }: { lives: number; sum: number }) {
  return <span>Сбор монет · вращений: <b className="text-accent">{"●".repeat(lives)}{"○".repeat(3 - lives)}</b> · сумма <b className="text-gold">{sum.toFixed(2)}×</b></span>;
}
function Chests({ values }: { values: number[] }) {
  return (
    <div className="grid gap-3 text-center">
      <p className="font-display text-[22px] font-bold text-gold">СУНДУКИ</p>
      <div className="flex gap-2 sm:gap-4">
        {values.map((v, i) => (
          <motion.div key={i} initial={{ rotateY: 180, opacity: 0.4 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: 0.5 + i * 0.7, duration: 0.6 }}
            className="grid h-28 w-20 place-items-center rounded-2xl bg-[linear-gradient(180deg,#fde68a,#b45309)] text-[#2a1600] shadow-[0_0_24px_rgb(251_191_36/0.6)] sm:w-24">
            <span className="text-[28px]" aria-hidden>🎁</span><span className="font-mono text-[18px] font-extrabold">{v}×</span>
          </motion.div>
        ))}
      </div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6 }} className="font-mono text-[18px] font-bold">Итого {values.reduce((a, b) => a + b, 0)}×</motion.p>
    </div>
  );
}
function Jackpot({ level }: { level: "mini" | "major" | "grand" }) {
  const L = [["mini", "МИНИ", 20, "#22d3ee"], ["major", "МАЖОР", 100, "#a855f7"], ["grand", "ГРАНД", 1000, "#fbbf24"]] as const;
  return (
    <div className="grid w-full max-w-sm gap-2 text-center">
      <p className="font-display text-[22px] font-bold text-cyan">ДЖЕКПОТ</p>
      {L.map(([k, name, m, c], i) => (
        <motion.div key={k} initial={{ opacity: 0, x: -20 }} animate={k === level ? { opacity: 1, x: 0, scale: [1, 1.08, 1] } : { opacity: 0.35, x: 0 }} transition={{ delay: i * 0.25, ...(k === level ? { scale: { repeat: Infinity, duration: 0.9, delay: 1 } } : {}) }}
          className="flex items-center justify-between rounded-xl px-4 py-2.5 font-display font-bold" style={{ background: `linear-gradient(90deg, ${c}33, ${c}11)`, boxShadow: k === level ? `0 0 24px ${c}, inset 0 0 0 2px ${c}` : `inset 0 0 0 1px ${c}55`, color: c }}>
          <span>{name}</span><span className="font-mono">{m}×</span>
        </motion.div>
      ))}
    </div>
  );
}
