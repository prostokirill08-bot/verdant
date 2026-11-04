"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { anticipationFrom } from "@/lib/fair/slots";
import { CRY, playCrystal, type CryResult, type CrySpin } from "@/lib/fair/slots2";
import { sfx } from "@/lib/sound";
import { ErrorLine, newKey, parsePoints, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "../kit";
import { BonusLabel, BonusTotal, DryCounter, InfoModal, Reels, SlotControls, sleep, useDrySpins, useSlotState, WinOverlay, winCells, winUnits, type BonusState, type LineWin } from "./SlotKit";

const NAMES: Record<string, string> = {
  castle: "Ледяной дворец", troika: "Тройка", key: "Золотой ключ", bauble_gold: "Золотой шар", bauble_red: "Красный шар",
  bauble_green: "Зелёный шар", bauble_blue: "Синий шар", orb: "Хрустальный шар", star: "Звезда",
};
const PAYING = CRY.ladder;
const randomSym = () => { const x = Math.random(); return x < 0.05 ? "orb" : x < 0.08 ? "star" : PAYING[Math.floor(Math.random() * PAYING.length)]!; };
/**
 * Демо-показы для администратора: зёрна генератора, при которых настоящий бонус движка даёт нужный исход
 * (найдены перебором): ×1647 и «шары на всё поле» — 15 ледяных дворцов, упор в максимальный выигрыш ×5000.
 */
const SHOWCASES = [
  { id: "x1000", seed: 811, key: "vd_showcase_crystal", title: "Демо-показ бонуса ×1000+", label: "Демо-показ" },
  { id: "full", seed: 20140805, key: "vd_showcase_crystal_full", title: "Демо: шары на всё поле", label: "Демо-показ · шары на всё поле" },
] as const;
const mulberry32 = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const START: string[][] = [["bauble_red", "castle", "bauble_blue"], ["key", "orb", "bauble_gold"], ["troika", "star", "bauble_green"], ["bauble_blue", "orb", "key"], ["bauble_gold", "troika", "bauble_red"]];

export function CrySym({ s, big }: { s: string; big?: boolean }) {
  return (
    <>
      <Image src={`/img/ny/slots/crystal/${s}.webp`} alt={NAMES[s] ?? s} fill sizes="120px" className={`rounded-lg object-cover ${s === "star" ? "ring-2 ring-gold/70" : s === "orb" ? "ring-2 ring-[#a78bfa]/80" : ""}`} draggable={false} />
      {s === "star" && !big && <BonusLabel />}
    </>
  );
}

const describe = (r: RoundView) => { const x = r.result as CryResult | null; if (!x) return "—"; return x.fs ? `Бонус: ${x.fs.spins.length} вращений${x.bought ? " (куплен)" : ""}` : x.base && x.base.mult > 0 ? `Выигрыш ${x.totalMult}×` : "Без выигрыша"; };

/** Слой поверх барабанов 5×3: подсветка шаров (раскрытых и прилипших). */
function OrbLayer({ cells, sticky, flash }: { cells: string[]; sticky: Set<string>; flash: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid grid-cols-5 grid-rows-3 gap-x-1.5 sm:gap-x-2">
      {Array.from({ length: 15 }, (_, i) => {
        const reel = i % 5, row = Math.floor(i / 5); const k = `${reel}:${row}`;
        const on = cells.includes(k); const st = sticky.has(k);
        return (
          <div key={k} className="relative" style={{ gridColumn: reel + 1, gridRow: row + 1 }}>
            {st && <div className="absolute inset-[3%] rounded-xl ring-2 ring-[#c4b5fd] shadow-[0_0_22px_#a78bfa,inset_0_0_18px_#a78bfa88]" />}
            {on && <motion.div key={`${flash}-${k}`} initial={{ opacity: 0.95, scale: 0.6 }} animate={{ opacity: 0, scale: 1.25 }} transition={{ duration: 0.8 }} className="absolute inset-0 rounded-full bg-[radial-gradient(circle,#ffffff,#c4b5fd_40%,transparent_70%)]" />}
          </div>
        );
      })}
    </div>
  );
}

export function CrystalGame({ cfg }: { cfg: GameConfig }) {
  const { setBalance, balance, user } = useAuth();
  const { run, busy: reqBusy, error } = useGameRequest();
  const { bet, setBet, turbo, setTurbo, auto, setAuto } = useSlotState(cfg);
  const [grid, setGrid] = useState<string[][]>(START);
  const [spinKey, setSpinKey] = useState(0);
  const [lines, setLines] = useState<LineWin[]>([]);
  const [hl, setHl] = useState<Set<string> | null>(null);
  const [orbCells, setOrbCells] = useState<string[]>([]);
  const [sticky, setSticky] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState(0);
  const [fs, setFs] = useState<(BonusState & { level: number }) | null>(null);
  const [banner, setBanner] = useState<React.ReactNode>(null);
  const [big, setBig] = useState<{ mult: number; amount: string; label?: string; short?: boolean } | null>(null);
  const { dry, prev, count } = useDrySpins("crystal", !!user);
  const [lastWin, setLastWin] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [version, setVersion] = useState(0);
  const [slowFrom, setSlowFrom] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  const [showcaseUsed, setShowcaseUsed] = useState<Record<string, boolean>>({ x1000: true, full: true });
  useEffect(() => {
    const read = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
    setShowcaseUsed(Object.fromEntries(SHOWCASES.map((s) => [s.id, read(s.key)])));
  }, []);
  const stop = useRef<() => void>(() => {});
  const bigDone = useRef<() => void>(() => {});
  const turboRef = useRef(turbo); turboRef.current = turbo;
  const t = (ms: number) => sleep(turboRef.current ? ms / 2 : ms);

  const spinTo = useCallback((g: string[][]) => new Promise<void>((res) => { stop.current = res; setHl(null); setLines([]); setOrbCells([]); setSlowFrom(anticipationFrom(g, "star")); setGrid(g); setSpinKey((k) => k + 1); }), []);
  const showBig = (mult: number, amount: string, label?: string, short = false) => new Promise<void>((res) => { bigDone.current = () => { setBig(null); res(); }; setBig({ mult, amount, label, short }); });

  async function showSpin(s: CrySpin, units: bigint, inBonus: boolean) {
    await spinTo(s.grid);
    if (s.orbs.length) {
      // Шары звенят по очереди, затем арфа — и все раскрываются в один символ
      s.orbs.forEach((_, i) => sfx("glass", { pitch: 1 + i * 0.07, delay: i * 90 }));
      await t(300 + s.orbs.length * 90);
      sfx("harp"); setFlash((f) => f + 1); setOrbCells(s.orbs); setGrid(s.revealed);
      await t(700);
    }
    const cells = winCells(s.wins, CRY.lines);
    if (s.scatter.count >= 3) s.grid.forEach((col, r) => col.forEach((x, row) => x === "star" && cells.add(`${r}:${row}`)));
    setLines(s.wins); setHl(cells.size ? cells : null);
    if (s.mult > 0 && s.mult < 10) sfx(s.mult >= 3 ? "bigwin" : "win");
    if (s.mult > 0 && !inBonus) setLastWin(winUnits(units, s.mult).toString());
    await t(s.mult > 0 ? 1000 : 250);
  }

  async function play(buy: boolean): Promise<boolean> {
    const units = parsePoints(bet) ?? 0n;
    setPlaying(true); setLastWin(null); setHl(null); setLines([]); setOrbCells([]);
    const r = await run<{ round: RoundView; balance: string }>("/api/games/crystal/bet", { amount: bet, params: { buy }, key: newKey() }, { deferBalance: true });
    if (!r) { setPlaying(false); return false; }
    setBalance((BigInt(balance) - BigInt(r.round.bet)).toString());
    const res = r.round.result as unknown as CryResult;
    if (res.base) await showSpin(res.base, units, false);
    if (!res.bought) count(!!res.fs);
    if (res.fs) await runBonus(res, units, r.round.payout);
    else if (res.totalMult >= 10) await showBig(res.totalMult, r.round.payout);
    setLastWin(r.round.payout);
    setBalance(r.balance); setVersion((v) => v + 1); setPlaying(false);
    return true;
  }

  /** Анимация бесплатных вращений (общая для настоящего раунда и демо-показа). */
  async function runBonus(res: CryResult, units: bigint, payout: string, label?: string) {
      const f = res.fs!;
      sfx("bonus"); setBanner(<Intro />); await sleep(2800); setBanner(null);
      let total = res.base ? winUnits(units, res.base.mult) : 0n; let left = CRY.freeSpins; let tick = 0;
      const cap = winUnits(units, CRY.maxWin); let fullShown = false;
      const stick = new Set<string>(); setSticky(new Set());
      for (let i = 0; i < f.spins.length; i++) {
        const s = f.spins[i]!; left--;
        setFs({ left, done: i + 1, total: total.toString(), add: null, tick, level: s.level });
        if (i > 0) { sfx("upgrade", { pitch: 1 + Math.min(s.level, 6) * 0.08 }); await t(450); }
        await showSpin(s, units, true);
        for (const k of s.orbs) stick.add(k);
        setSticky(new Set(stick));
        // Всё поле в шарах — отдельное торжество
        if (s.orbs.length === CRY.reels * CRY.rows && !fullShown) {
          fullShown = true; sfx("jackpot");
          await t(1500);   // сначала даём рассмотреть поле из 15 одинаковых символов
          setBanner(<motion.div initial={{ scale: 0.5 }} animate={{ scale: [0.5, 1.15, 1] }} className="grid gap-1 text-center"><p className="font-display text-[clamp(22px,6vw,36px)] font-bold text-[#e9d5ff]">ВСЁ ПОЛЕ В ШАРАХ!</p><p className="text-white/80">15 из 15 · внутри — {NAMES[s.reveal ?? "castle"]}</p></motion.div>);
          await sleep(2200); setBanner(null);
        }
        // Выигрыш бонуса не больше максимального (×maxWin ставки) — как и выплата на сервере
        const add0 = winUnits(units, s.mult); const add = total + add0 > cap ? cap - total : add0;
        if (add > 0n) { total += add; tick++; sfx("coin"); }
        setFs({ left, done: i + 1, total: total.toString(), add: add > 0n ? add.toString() : null, tick, level: s.level });
        setLastWin(total.toString());
        if (s.mult >= 10) await showBig(s.mult, add0.toString(), `Вращение ${i + 1}`, true);
        if (total >= cap) {
          sfx("jackpot"); setBanner(<motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="px-4 text-center font-display text-[clamp(22px,6vw,34px)] font-bold text-gold">МАКСИМАЛЬНЫЙ ВЫИГРЫШ ×{CRY.maxWin.toLocaleString("ru-RU")}!</motion.p>);
          await sleep(2200); setBanner(null); break;   // дальше крутить незачем — выплата уже на потолке
        }
        if (s.trigger) { sfx("bonus"); left += CRY.retrigger; setBanner(<motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="font-display text-[28px] font-bold text-gold">+{CRY.retrigger} ВРАЩЕНИЙ!</motion.p>); await sleep(1400); setBanner(null); }
      }
      await showBig(res.totalMult, payout, label ?? `Бонус: ${f.spins.length} вращений`);
      setFs(null); setSticky(new Set()); setOrbCells([]);
  }

  /**
   * Демо-показ для администратора: настоящий бонус движка «Хрустального шара» (найденный поток
   * случайных чисел из SHOWCASES), но без ставки — баланс, история и лента не меняются, на экране пометка «Демо-показ».
   * Кнопка срабатывает один раз (запоминается в браузере).
   */
  async function showcase(sc: (typeof SHOWCASES)[number]) {
    if (playing) return;
    try { localStorage.setItem(sc.key, "1"); } catch { /* приватный режим */ }
    setShowcaseUsed((u) => ({ ...u, [sc.id]: true })); setDemo(true); setPlaying(true); setLastWin(null); setHl(null); setLines([]); setOrbCells([]);
    const res = playCrystal(mulberry32(sc.seed), { buy: true });
    const units = parsePoints(bet) ?? 100n;
    await runBonus(res, units, winUnits(units, res.totalMult).toString(), sc.label);
    setLastWin(null); setDemo(false); setPlaying(false);
  }

  useEffect(() => {
    if (auto <= 0 || playing || reqBusy) return;
    if (user && (parsePoints(bet) ?? 0n) > BigInt(balance)) { setAuto(0); return; }
    const tm = setTimeout(async () => { const cont = await play(false); setAuto((a) => (cont && a > 0 ? a - 1 : 0)); }, 250);
    return () => clearTimeout(tm);
  }, [auto, playing, reqBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = playing || reqBusy;
  const isAdmin = user?.role === "ADMIN";
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <div className="relative overflow-hidden rounded-[28px] ring-1 ring-white/10" style={{ boxShadow: "0 30px 80px -40px #a78bfa" }}>
        <Image src="/img/ny/bg/crystal.webp" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#120a2e]/45 via-[#0b0820]/35 to-[#070b1f]/92" />
        <div className="relative mx-auto grid max-w-[720px] gap-4 p-3 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[clamp(20px,4vw,30px)] font-bold tracking-wide text-[#e9d5ff] drop-shadow-[0_2px_14px_rgb(167_139_250/0.9)]">🔮 ХРУСТАЛЬНЫЙ ШАР</h2>
          </div>
          {/* Лестница улучшений: какой символ сейчас внутри шаров */}
          <AnimatePresence>{fs && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-7 gap-1 rounded-2xl bg-black/50 p-1.5 ring-1 ring-[#a78bfa]/50" data-testid="crystal-ladder">
              {CRY.ladder.map((s, i) => {
                const on = Math.min(fs.level, CRY.ladder.length - 1) === i; const past = i < Math.min(fs.level, CRY.ladder.length - 1);
                return (
                  <motion.div key={s} animate={on ? { scale: [1, 1.15, 1] } : { scale: 1 }} transition={{ duration: 0.6 }}
                    className={`relative aspect-square overflow-hidden rounded-lg ${on ? "ring-2 ring-gold shadow-[0_0_18px_#ffd166]" : past ? "opacity-35" : "opacity-70"}`}>
                    <CrySym s={s} big />
                  </motion.div>
                );
              })}
            </motion.div>
          )}</AnimatePresence>
          {demo && <p className="rounded-xl bg-gold/15 px-3 py-2 text-center text-[13px] font-bold text-gold ring-1 ring-gold/50" data-testid="showcase-badge">🎬 ДЕМО-ПОКАЗ · без ставки, баланс не меняется, раунд не записывается</p>}
          <BonusTotal state={fs} color="#c4b5fd" title="🔮 Бонус" sub={fs ? `Шаров на поле: ${sticky.size} · внутри: ${NAMES[CRY.ladder[Math.min(fs.level, 6)]!]}` : undefined} />
          <div className="snow-cap relative rounded-2xl bg-[linear-gradient(180deg,#2a1b5e,#0f0b2e)] p-2 shadow-[inset_0_0_0_2px_rgb(196_181_253/0.55),0_20px_50px_-20px_#000] sm:p-3">
            <Reels grid={grid} rows={3} spinKey={spinKey} turbo={turbo || !!fs} filler={randomSym} onStopped={() => stop.current()} slowFrom={slowFrom}
              render={(c) => <CrySym s={c} />} highlight={hl} lines={lines} linePatterns={CRY.lines} sound={{ spin: "whoosh", stop: "glass" }}
              overlay={<OrbLayer cells={orbCells} sticky={sticky} flash={flash} />} />
            <AnimatePresence>{banner && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-black/75">{banner}</motion.div>
            )}</AnimatePresence>
            <WinOverlay show={!!big} mult={big?.mult ?? 0} amount={big?.amount ?? "0"} label={big?.label} short={big?.short} onDone={() => bigDone.current()} />
          </div>
          <DryCounter dry={dry} prev={prev} avg={160} />
          {isAdmin && SHOWCASES.filter((sc) => !showcaseUsed[sc.id]).map((sc) => (
            <button key={sc.id} type="button" onClick={() => void showcase(sc)} disabled={busy} data-testid={`showcase-${sc.id}`}
              className="rounded-xl bg-[linear-gradient(180deg,#a78bfa,#6d28d9)] px-4 py-2.5 text-[13.5px] font-bold text-white shadow-[0_0_24px_-6px_#a78bfa] hover:brightness-110 disabled:opacity-50">
              🎬 {sc.title} <span className="font-normal opacity-80">(только админ, один раз, без ставки)</span>
            </button>
          ))}
          {user ? (
            <SlotControls cfg={cfg} bet={bet} setBet={setBet} busy={busy} onSpin={() => void play(false)} onBuy={() => void play(true)} buyPrice={CRY.buyPrice}
              auto={auto} setAuto={setAuto} turbo={turbo} setTurbo={setTurbo} onInfo={() => setInfo(true)} accent={["#6d28d9", "#a78bfa"]} lastWin={lastWin} />
          ) : <PlayButton onClick={() => {}}>Войти</PlayButton>}
          <ErrorLine text={error} />
        </div>
      </div>
      <RoundsPanel slug="crystal" version={version} describe={describe} />
      <InfoModal open={info} onClose={() => setInfo(false)} title="Хрустальный шар — выплаты">
        <p>10 линий, ставка делится поровну между линиями. Выплата — за 3–5 одинаковых символов слева направо; числа — во сколько раз выигрыш больше ставки на линию.</p>
        <div className="grid grid-cols-2 gap-2">
          {[...CRY.ladder].reverse().map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-xl bg-ink p-2">
              <span className="relative size-12 shrink-0"><CrySym s={s} big /></span>
              <span className="font-mono text-[12px]">{Object.entries(CRY.pays[s]!).reverse().map(([n, v]) => <span key={n} className="block">{n}× — {v}</span>)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3">
          <span className="relative size-14 shrink-0"><CrySym s="orb" big /></span>
          <p><b className="text-[#c4b5fd]">Хрустальный шар</b> — символ-загадка. После остановки все шары на поле раскрываются в <b>один и тот же</b> случайный символ.</p>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-ink p-3">
          <span className="relative size-14 shrink-0"><CrySym s="star" big /></span>
          <p><b className="text-gold">Звезда</b>: 3, 4 или 5 в любом месте платят {CRY.scatterPays[3]}×, {CRY.scatterPays[4]}× или {CRY.scatterPays[5]}× ставки и дают <b>{CRY.freeSpins} бесплатных вращений</b>. В бонусе шары <b>прилипают</b> до конца, а символ внутри них каждое вращение <b>дорожает на ступень</b>: синий шар → зелёный → красный → золотой → ключ → тройка → дворец. 3 звезды в бонусе — ещё +{CRY.retrigger}.</p>
        </div>
        <p>«Купить бонус» — {CRY.buyPrice}× ставки. Максимальный выигрыш — {CRY.maxWin.toLocaleString("ru-RU")}× ставки. Расчётный RTP ≈ 96,5%. Каждый раунд проверяется на странице «Честность».</p>
      </InfoModal>
    </div>
  );
}

function Intro() {
  return (
    <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }} className="grid place-items-center gap-3 p-4 text-center">
      <motion.div animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.08, 1] }} transition={{ duration: 1.6, repeat: Infinity }} className="relative size-24 rounded-full shadow-[0_0_50px_#a78bfa]"><CrySym s="orb" big /></motion.div>
      <p className="font-display text-[clamp(20px,5vw,34px)] font-bold text-[#e9d5ff]">{CRY.freeSpins} БЕСПЛАТНЫХ ВРАЩЕНИЙ</p>
      <p className="max-w-xs text-[13.5px] text-white/80">Шары прилипают к полю, а символ внутри них с каждым вращением становится дороже — до Ледяного дворца</p>
    </motion.div>
  );
}
