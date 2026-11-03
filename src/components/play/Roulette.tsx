"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { RED_NUMBERS, ROULETTE_WHEEL, rouletteColor, type RouletteBetKind } from "@/lib/fair/outcomes";
import { points } from "@/lib/format";
import { ErrorLine, GameLayout, Label, newKey, PlayButton, RoundsPanel, Stat, unitsToInput, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Res = { round: RoundView; balance: string };
const CHIPS = [100n, 500n, 1000n, 5000n, 10000n, 50000n]; // 1, 5, 10, 50, 100, 500 снежинок
const CHIP_COLOR: Record<string, string> = { "100": "#c3cbd0", "500": "#22b8cf", "1000": "#00c47a", "5000": "#f5b84a", "10000": "#ff8a3d", "50000": "#6e7bff" };
const keyOf = (b: RouletteBetKind) => ("n" in b ? `${b.kind}:${b.n}` : b.kind);
const fromKey = (k: string): RouletteBetKind => { const [kind, n] = k.split(":"); return (n !== undefined ? { kind, n: Number(n) } : { kind }) as RouletteBetKind; };
const describe = (r: RoundView) => { const x = r.result as { number: number; color: string } | null; return x ? `Выпало ${x.number} (${x.color === "red" ? "красное" : x.color === "black" ? "чёрное" : "зеро"})` : "—"; };
const SECTOR = 360 / 37;
// Праздничные цвета: зеро — ёлочный зелёный, красные — рождественский красный, чёрные — ночное небо
const fill = (n: number) => (n === 0 ? "#1f9d55" : RED_NUMBERS.has(n) ? "#d81b3c" : "#121a3d");

export function RouletteGame({ cfg }: { cfg: GameConfig }) {
  const { balance, setBalance } = useAuth();
  const { run, busy, error } = useGameRequest();
  const [chip, setChip] = useState(1000n);
  const [bets, setBets] = useState<Record<string, bigint>>({});
  const [history, setHistory] = useState<Record<string, bigint>[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<{ n: number; payout: bigint; id: string } | null>(null);
  const [recent, setRecent] = useState<{ n: number; id: string }[]>([]);
  const [version, setVersion] = useState(0);

  const total = Object.values(bets).reduce((s, v) => s + v, 0n);
  const overBalance = total > BigInt(balance);
  const limitErr = total > BigInt(cfg.maxBet) ? `Сумма ставок больше лимита ${points(cfg.maxBet)}` : "";

  function place(b: RouletteBetKind) {
    if (spinning) return;
    const k = keyOf(b);
    setHistory((h) => [...h, bets]); setBets((p) => ({ ...p, [k]: (p[k] ?? 0n) + chip })); setResult(null);
  }
  const undo = () => { const prev = history.at(-1); if (prev) { setBets(prev); setHistory((h) => h.slice(0, -1)); } };
  const clear = () => { if (total) { setHistory((h) => [...h, bets]); setBets({}); } };
  const double = () => { setHistory((h) => [...h, bets]); setBets((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v * 2n]))); };

  async function spin() {
    const list = Object.entries(bets).filter(([, v]) => v > 0n).map(([k, v]) => ({ bet: fromKey(k), amount: unitsToInput(v) }));
    const r = await run<Res>("/api/games/roulette/bet", { params: { bets: list }, key: newKey() }, { deferBalance: true });
    if (!r) return;
    const n = (r.round.result as { number: number }).number;
    const idx = ROULETTE_WHEEL.indexOf(n as (typeof ROULETTE_WHEEL)[number]);
    // Колесо докручивается так, чтобы сектор с числом встал под указатель сверху
    const base = angle - (angle % 360);
    setSpinning(true); setResult(null);
    setAngle(base + 360 * 5 - idx * SECTOR - (Math.random() - 0.5) * SECTOR * 0.6);
    setTimeout(() => {
      setSpinning(false); setBalance(r.balance);
      setResult({ n, payout: BigInt(r.round.payout), id: r.round.id });
      setRecent((p) => [{ n, id: r.round.id }, ...p].slice(0, 14)); setVersion((v) => v + 1);
    }, 4200);
  }

  const cell = (b: RouletteBetKind, label: React.ReactNode, cls: string, win?: boolean) => {
    const v = bets[keyOf(b)];
    return (
      <button type="button" onClick={() => place(b)} disabled={spinning}
        className={`relative grid place-items-center rounded-md text-[13px] font-semibold transition-[filter,box-shadow] hover:brightness-125 disabled:cursor-not-allowed ${cls} ${win ? "ring-2 ring-white" : ""}`}>
        {label}
        {v && <span className="absolute -right-1 -top-1 z-10 grid h-5 min-w-5 place-items-center rounded-full px-1 font-mono text-[9.5px] font-bold text-ink shadow ring-2 ring-ink" style={{ background: CHIP_COLOR[(CHIPS.filter((c) => c <= v).at(-1) ?? CHIPS[0]!).toString()] }}>{short(v)}</span>}
      </button>
    );
  };
  const wn = result?.n;

  const controls = (
    <>
      <div>
        <Label>Фишка</Label>
        <div className="grid grid-cols-6 gap-1.5">
          {CHIPS.map((c) => (
            <button key={c.toString()} type="button" onClick={() => setChip(c)} aria-pressed={chip === c}
              className={`grid aspect-square place-items-center rounded-full font-mono text-[11px] font-bold text-ink transition-transform ${chip === c ? "scale-110 ring-2 ring-white" : "opacity-80 hover:opacity-100"}`}
              style={{ background: `radial-gradient(circle, ${CHIP_COLOR[c.toString()]} 55%, rgb(0 0 0/0.25) 56%, ${CHIP_COLOR[c.toString()]} 62%)` }}>{short(c)}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" onClick={undo} disabled={spinning || !history.length} className="h-9 rounded-lg bg-raised text-[13px] font-semibold text-soft hover:text-white disabled:opacity-40">Отменить</button>
        <button type="button" onClick={double} disabled={spinning || !total} className="h-9 rounded-lg bg-raised text-[13px] font-semibold text-soft hover:text-white disabled:opacity-40">Удвоить</button>
        <button type="button" onClick={clear} disabled={spinning || !total} className="h-9 rounded-lg bg-raised text-[13px] font-semibold text-soft hover:text-white disabled:opacity-40">Очистить</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Сумма ставок" value={points(total)} />
        <Stat label="Последний выигрыш" value={result ? points(result.payout) : "—"} tone={result && result.payout > 0n ? "accent" : undefined} />
      </div>
      <ErrorLine text={error || limitErr || (overBalance ? "Недостаточно снежинок" : "")} />
      <PlayButton onClick={spin} loading={busy || spinning} disabled={!cfg.enabled || !total || overBalance || !!limitErr || total < BigInt(cfg.minBet)}>{cfg.enabled ? (total ? "Крутить" : "Поставь фишки на поле") : "Игра отключена"}</PlayButton>
    </>
  );

  const stage = (
    <div className="grid gap-5 p-4 sm:p-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
        <div className="relative size-[220px] sm:size-[250px]">
          <svg viewBox="-110 -110 220 220" className="absolute inset-0" aria-hidden><path d="M-7 -108 L7 -108 L0 -94Z" fill="#fff" /></svg>
          <motion.svg viewBox="-100 -100 200 200" className="size-full drop-shadow-[0_10px_30px_rgb(0_0_0/0.5)]" animate={{ rotate: angle }} transition={{ duration: spinning ? 4 : 0, ease: [0.15, 0.6, 0.15, 1] }} role="img" aria-label="Колесо рулетки">
            <circle r="98" fill="#ffd166" />
            {ROULETTE_WHEEL.map((n, i) => {
              const a0 = ((i - 0.5) * SECTOR - 90) * (Math.PI / 180), a1 = ((i + 0.5) * SECTOR - 90) * (Math.PI / 180);
              const R = 94, r = 62;
              const d = `M${r * Math.cos(a0)} ${r * Math.sin(a0)} L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} L${r * Math.cos(a1)} ${r * Math.sin(a1)} A${r} ${r} 0 0 0 ${r * Math.cos(a0)} ${r * Math.sin(a0)}Z`;
              const am = i * SECTOR - 90; const tx = 84 * Math.cos((am * Math.PI) / 180), ty = 84 * Math.sin((am * Math.PI) / 180);
              return (
                <g key={n}>
                  <path d={d} fill={fill(n)} stroke="#101214" strokeWidth=".6" />
                  <text x={tx} y={ty} fill="#fff" fontSize="7.5" fontWeight="700" textAnchor="middle" dominantBaseline="central" transform={`rotate(${am + 90} ${tx} ${ty})`}>{n}</text>
                </g>
              );
            })}
            <circle r="60" fill="#0f1633" stroke="#ffd166" strokeWidth="2" />
            <circle r="22" fill="#1a2349" stroke="#ffd166" strokeWidth="1.5" /><circle r="6" fill="#e8263f" />
            {[0, 60, 120, 180, 240, 300].map((a) => <rect key={a} x="-2" y="-58" width="4" height="34" rx="2" fill="#2c3338" transform={`rotate(${a})`} />)}
          </motion.svg>
        </div>
        <div className="grid place-items-center gap-2">
          <div className={`grid size-24 place-items-center rounded-2xl font-display text-[40px] font-bold ring-1 ring-line ${wn === undefined ? "bg-ink text-raised" : ""}`} style={wn !== undefined ? { background: fill(wn) } : {}} aria-live="polite">
            {spinning ? "…" : wn ?? "—"}
          </div>
          <p className="h-5 text-[14px] text-soft">{result ? (result.payout > 0n ? <span className="font-semibold text-accent">+{points(result.payout)}</span> : "Без выигрыша") : spinning ? "Крутится…" : ""}</p>
          <div className="flex max-w-[240px] flex-wrap justify-center gap-1">
            {recent.map((r) => <span key={r.id} className="grid size-6 place-items-center rounded-md font-mono text-[11px] font-bold" style={{ background: fill(r.n) }}>{r.n}</span>)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[620px] grid-cols-[44px_repeat(12,minmax(0,1fr))_48px] grid-rows-[repeat(3,40px)_36px_36px] gap-1">
          <div className="row-span-3">{cell({ kind: "straight", n: 0 }, "0", "size-full bg-[#1f9d55]", wn === 0)}</div>
          {[3, 2, 1].map((rowTop, ri) => (
            <div key={rowTop} className="contents">
              {Array.from({ length: 12 }, (_, c) => { const n = c * 3 + rowTop; return <div key={n} style={{ gridRow: ri + 1, gridColumn: c + 2 }}>{cell({ kind: "straight", n }, n, `size-full ${rouletteColor(n) === "red" ? "bg-[#d81b3c]" : "bg-[#121a3d] ring-1 ring-line"}`, wn === n)}</div>; })}
              <div style={{ gridRow: ri + 1, gridColumn: 14 }}>{cell({ kind: "column", n: (3 - ri) as 1 | 2 | 3 }, "2:1", "size-full bg-raised text-soft")}</div>
            </div>
          ))}
          {[1, 2, 3].map((d) => <div key={d} style={{ gridRow: 4, gridColumn: `${(d - 1) * 4 + 2} / span 4` }}>{cell({ kind: "dozen", n: d as 1 | 2 | 3 }, `${(d - 1) * 12 + 1}–${d * 12}`, "size-full bg-raised text-soft")}</div>)}
          {([[{ kind: "low" }, "1–18", "bg-raised text-soft"], [{ kind: "even" }, "Чёт", "bg-raised text-soft"], [{ kind: "red" }, "Красное", "bg-[#d81b3c]"], [{ kind: "black" }, "Чёрное", "bg-[#121a3d] ring-1 ring-line"], [{ kind: "odd" }, "Нечёт", "bg-raised text-soft"], [{ kind: "high" }, "19–36", "bg-raised text-soft"]] as [RouletteBetKind, string, string][]).map(([b, t, c], i) => (
            <div key={t} style={{ gridRow: 5, gridColumn: `${i * 2 + 2} / span 2` }}>{cell(b, t, `size-full ${c}`)}</div>
          ))}
        </div>
      </div>
      <p className="text-center text-[12px] text-muted">Число — 36×, дюжина и колонка — 3×, цвет, чёт/нечёт и половины — 2×. Европейская рулетка, 37 секторов.</p>
    </div>
  );

  return <GameLayout slug="roulette" controls={controls} stage={stage} footer={<RoundsPanel slug="roulette" version={version} describe={describe} />} />;
}

function short(u: bigint) {
  const p = Number(u) / 100;
  return p >= 1000 ? `${Math.round(p / 100) / 10}k` : p % 1 ? p.toFixed(1) : String(p);
}
