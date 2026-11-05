"use client";
import { sfx, winSfx } from "@/lib/sound";
import NextImage from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { CRASH_GROWTH, crashMultiplierAt } from "@/lib/fair/outcomes";
import { api } from "@/lib/api";
import { points } from "@/lib/format";
import { BetAmount, betError, ErrorLine, GameLayout, Label, newKey, Panel, PlayButton, RoundsPanel, useGameRequest, type GameConfig, type RoundView } from "./kit";

type Round = { id: string; status: "BETTING" | "RUNNING" | "CRASHED" | "CANCELLED" | "DISABLED"; hash: string; bettingEndsAt: number; startedAt: number | null; crashedAt: number | null; crashPoint: number | null; serverSeed: string | null };
type Bet = { id: string; user: string; avatar: string; amount: string; auto: number | null; status?: string; multiplier?: number; payout?: string };
type Hist = { id: string; crashPoint: number; serverSeed: string; serverSeedHash: string };
type Snapshot = { serverNow: number; round: Round | null; bets: Bet[]; history: Hist[] };
type Msg = (Snapshot & { t: "snapshot" }) | { t: "state"; state: Round; serverNow: number } | { t: "bet"; bet: Bet; serverNow: number } | { t: "cashout"; cashout: { id: string; user: string; multiplier: number; payout: string }; serverNow: number };

const describe = (r: RoundView) => {
  const auto = (r.params as { autoCashout: number | null }).autoCashout; const cp = r.fair?.crashPoint;
  return r.status === "WON" ? `Вывод на ${r.multiplier.toFixed(2)}×${cp ? ` · обвал ${cp.toFixed(2)}×` : ""}` : r.status === "CANCELLED" ? "Раунд отменён, ставка возвращена" : `Обвал на ${cp?.toFixed(2) ?? "—"}×${auto ? ` · автовывод ${auto}×` : ""}`;
};
const cpTone = (m: number) => (m >= 10 ? "text-warn" : m >= 2 ? "text-accent" : "text-muted");

/** Поток событий Crash: WebSocket с переподключением; если сокет недоступен — опрос REST раз в 1,5 с. */
function useCrashFeed() {
  const [round, setRound] = useState<Round | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [history, setHistory] = useState<Hist[]>([]);
  const [online, setOnline] = useState(false);
  const offset = useRef(0); // серверное время − локальное
  const apply = useCallback((m: Msg) => {
    offset.current = m.serverNow - Date.now();
    if (m.t === "snapshot") { setRound(m.round); setBets(m.bets); setHistory(m.history); return; }
    if (m.t === "state") {
      setRound((prev) => { if (m.state.status === "BETTING" && prev?.id !== m.state.id) setBets([]); return m.state; });
      if (m.state.status === "CRASHED" && m.state.crashPoint !== null) {
        const s = m.state;
        setHistory((h) => (h[0]?.id === s.id ? h : [{ id: s.id, crashPoint: s.crashPoint!, serverSeed: s.serverSeed!, serverSeedHash: s.hash }, ...h].slice(0, 20)));
        setBets((b) => b.map((x) => (x.status === "ACTIVE" || !x.status ? { ...x, status: "LOST" } : x)));
      }
    }
    if (m.t === "bet") setBets((b) => (b.some((x) => x.id === m.bet.id) ? b : [...b, { ...m.bet, status: "ACTIVE" }]));
    if (m.t === "cashout") setBets((b) => b.map((x) => (x.id === m.cashout.id ? { ...x, status: "WON", multiplier: m.cashout.multiplier, payout: m.cashout.payout } : x)));
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null; let closed = false; let tries = 0;
    let poll: ReturnType<typeof setInterval> | undefined; let retry: ReturnType<typeof setTimeout> | undefined;
    const startPoll = () => { if (poll) return; const f = () => api<Snapshot>("/api/crash/state").then((s) => apply({ t: "snapshot", ...s })).catch(() => {}); f(); poll = setInterval(f, 1500); };
    const connect = () => {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/crash`);
      ws.onopen = () => { tries = 0; setOnline(true); if (poll) { clearInterval(poll); poll = undefined; } };
      ws.onmessage = (e) => { try { apply(JSON.parse(e.data as string) as Msg); } catch { /* пропускаем */ } };
      ws.onclose = () => { setOnline(false); if (closed) return; tries++; if (tries >= 3) startPoll(); retry = setTimeout(connect, Math.min(1000 * 2 ** tries, 15000)); };
    };
    connect();
    return () => { closed = true; ws?.close(); if (poll) clearInterval(poll); if (retry) clearTimeout(retry); };
  }, [apply]);
  const now = useCallback(() => Date.now() + offset.current, []);
  return { round, bets, history, online, now };
}

export function CrashGame({ cfg }: { cfg: GameConfig }) {
  const { user, balance, refresh, setBalance } = useAuth();
  const { run, busy, error, setError } = useGameRequest();
  const { round, bets, history, online, now } = useCrashFeed();
  const [amount, setAmount] = useState("10");
  const [autoOn, setAutoOn] = useState(false);
  const [auto, setAuto] = useState("2");
  const [version, setVersion] = useState(0);
  const [tick, setTick] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  // Своя ставка — по её ID (ник в публичном списке может быть скрыт); старый способ по нику — запасной
  const [myBetId, setMyBetId] = useState<string | null>(null);
  useEffect(() => { if (user) api<{ myBetId: string | null }>("/api/crash/state").then((s) => s.myBetId && setMyBetId(s.myBetId)).catch(() => {}); }, [user]);
  const mine = user ? bets.find((b) => b.id === myBetId) ?? bets.find((b) => b.user === user.username) : undefined;
  const status = round?.status;
  const myActiveRef = useRef(false); myActiveRef.current = mine?.status === "ACTIVE";

  // Звуки: старт и обвал — только когда в раунде есть моя ставка; мой вывод — звон монет
  const prevStatus = useRef(status);
  useEffect(() => {
    const was = prevStatus.current; prevStatus.current = status;
    if (!mine || was === status) return;
    if (status === "RUNNING") sfx("launch");
    if (status === "CRASHED" && mine.status !== "WON") sfx("boom");
  }, [status, mine]);
  const soundedWin = useRef("");
  useEffect(() => {
    if (mine?.status === "WON" && soundedWin.current !== mine.id) { soundedWin.current = mine.id; sfx("cashout"); winSfx(mine.multiplier ?? 1, 150); }
  }, [mine]);
  const autoNum = Number(auto.replace(",", "."));
  const autoOk = !autoOn || (Number.isFinite(autoNum) && autoNum >= 1.01 && autoNum <= 10000);

  // После расчёта моей ставки — обновить баланс и историю
  const settledRef = useRef<string>("");
  useEffect(() => {
    if (mine && mine.status && mine.status !== "ACTIVE" && settledRef.current !== mine.id + mine.status) {
      settledRef.current = mine.id + mine.status; void refresh(); setVersion((v) => v + 1);
    }
  }, [mine, refresh]);

  // Таймер для обратного отсчёта и надписи на кнопке
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 100); return () => clearInterval(t); }, []);

  // Спрайт саней Санты (PNG с прозрачностью)
  const sleigh = useRef<HTMLImageElement | null>(null);
  useEffect(() => { const img = new Image(); img.src = "/img/ny/sprites/sleigh.png"; sleigh.current = img; }, []);
  const drawSleigh = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, crashed: boolean, w: number) => {
    const img = sleigh.current!; const sw = Math.min(150, Math.max(90, w * 0.16)); const sh = (sw * img.naturalHeight) / img.naturalWidth;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.max(-1.1, Math.min(ang, 1.4)));
    if (crashed) ctx.globalAlpha = 0.85;
    ctx.drawImage(img, -sw * 0.88, -sh * 0.78, sw, sh); // нос оленей — на конце кривой
    ctx.restore(); ctx.globalAlpha = 1;
  }, []);

  // Отрисовка графика: множитель e^(k·t) от момента старта по серверным часам
  useEffect(() => {
    let raf = 0; let lastStep = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current; if (!c) return;
      const dpr = window.devicePixelRatio || 1; const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      const ctx = c.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      let elapsed = 0, m = 1;
      if (round?.status === "RUNNING" && round.startedAt) { elapsed = Math.max(0, now() - round.startedAt); m = crashMultiplierAt(elapsed); }
      if (round?.status === "CRASHED" && round.crashPoint && round.startedAt) { m = round.crashPoint; elapsed = Math.log(m) / CRASH_GROWTH; }
      const tMax = Math.max(elapsed, 8000), mMax = Math.max(m * 1.15, 2);
      const pad = { l: 44, b: 28, t: 16, r: 16 };
      const X = (t: number) => pad.l + (t / tMax) * (w - pad.l - pad.r);
      const Y = (v: number) => h - pad.b - ((v - 1) / (mMax - 1)) * (h - pad.b - pad.t);
      // сетка
      ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.fillStyle = "#aab6e0"; ctx.font = "11px var(--font-geist-mono), monospace"; ctx.lineWidth = 1;
      const step = mMax > 20 ? 10 : mMax > 6 ? 2 : mMax > 3 ? 0.5 : 0.25;
      for (let v = 1; v <= mMax; v += step) { ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke(); ctx.fillText(`${v.toFixed(v < 10 ? 1 : 0)}×`, 6, Y(v) + 4); }
      for (let s = 0; s <= tMax / 1000; s += tMax > 30000 ? 10 : 2) ctx.fillText(`${s}с`, X(s * 1000) - 6, h - 8);
      if (!elapsed) { if (sleigh.current?.complete) drawSleigh(ctx, X(0) + 10, Y(1) - 18, -0.15, false, w); return; }
      const crashed = round?.status === "CRASHED"; const col = crashed ? "#ff4d6d" : "#ffd166";
      // Золотой шлейф саней
      ctx.beginPath(); ctx.moveTo(X(0), Y(1));
      for (let i = 1; i <= 80; i++) { const t = (elapsed * i) / 80; ctx.lineTo(X(t), Y(Math.exp(CRASH_GROWTH * t))); }
      ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.lineCap = "round"; ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.lineTo(X(elapsed), Y(1)); ctx.closePath();
      const g = ctx.createLinearGradient(0, pad.t, 0, h); g.addColorStop(0, crashed ? "rgba(255,77,109,.25)" : "rgba(255,209,102,.22)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fill();
      // Искры за санями
      const nowMs = performance.now();
      for (let i = 0; i < 14; i++) {
        const t = elapsed * (1 - (i + 1) * 0.018); if (t <= 0) break;
        const px = X(t) + Math.sin(nowMs / 120 + i) * 3, py = Y(Math.exp(CRASH_GROWTH * t)) + Math.cos(nowMs / 150 + i * 2) * 3;
        ctx.globalAlpha = crashed ? 0.25 : 1 - i / 14; ctx.fillStyle = i % 3 ? "#fff6d0" : "#ffd166";
        ctx.beginPath(); ctx.arc(px, py, 2.4 - i * 0.12, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Сани Санты на конце кривой, наклонены по касательной
      const tx = X(elapsed), ty = Y(m);
      const dt = Math.max(elapsed * 0.02, 50); const ang = Math.atan2(Y(Math.exp(CRASH_GROWTH * elapsed)) - Y(Math.exp(CRASH_GROWTH * (elapsed - dt))), X(elapsed) - X(elapsed - dt));
      if (sleigh.current?.complete) drawSleigh(ctx, tx, ty, crashed ? ang + 0.9 : ang, crashed, w);
      else { ctx.beginPath(); ctx.arc(tx, ty, 7, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); }
      if (label.current) label.current.textContent = `${m.toFixed(2)}×`;
      // Пока моя ставка в игре — тик на каждые +0,25×, всё выше по тону
      if (!crashed && myActiveRef.current) { const step = Math.floor((m - 1) * 4); if (step > lastStep) { lastStep = step; sfx("tick", { pitch: Math.min(2.2, 0.6 + Math.log2(m) * 0.5) }); } }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [round, now, drawSleigh]);

  async function placeBet() {
    const r = await run<{ roundId: string; balance: string }>("/api/crash/bet", { amount, autoCashout: autoOn ? Math.round(autoNum * 100) / 100 : null, key: newKey() });
    if (r) { setBalance(r.balance); setMyBetId(r.roundId); sfx("chip"); }
  }
  async function cashout() {
    const r = await run<{ multiplier: number; payout: string; balance: string }>("/api/crash/cashout", {});
    if (r) { setError(""); setVersion((v) => v + 1); }
  }

  void tick;
  const left = round && status === "BETTING" ? Math.max(0, round.bettingEndsAt - now()) : 0;
  const liveMult = status === "RUNNING" && round?.startedAt ? crashMultiplierAt(now() - round.startedAt) : 1;
  const myActive = mine?.status === "ACTIVE";

  let button: React.ReactNode;
  if (status === "DISABLED") button = <PlayButton onClick={() => {}} disabled>Игра отключена</PlayButton>;
  else if (status === "RUNNING" && myActive) button = <PlayButton onClick={cashout} loading={busy}>Забрать {points((BigInt(mine!.amount) * BigInt(Math.round(liveMult * 100))) / 100n)}</PlayButton>;
  else if (status === "BETTING" && !mine) button = <PlayButton onClick={placeBet} loading={busy} disabled={!cfg.enabled || !autoOk || left < 200 || !!betError(amount, cfg, balance)}>Поставить</PlayButton>;
  else if (status === "BETTING" && mine) button = <PlayButton onClick={() => {}} disabled>Ставка принята — ждём старт</PlayButton>;
  else button = <PlayButton onClick={() => {}} disabled>{mine?.status === "WON" ? `Выведено на ${mine.multiplier?.toFixed(2)}×` : "Ставки откроются в следующем раунде"}</PlayButton>;

  const controls = (
    <>
      <BetAmount value={amount} onChange={setAmount} cfg={cfg} disabled={!!mine && status !== "CRASHED"} />
      <div>
        <Label aside={<label className="flex cursor-pointer items-center gap-2 text-soft"><input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} className="accent-[#e8263f]" />вкл.</label>}>Автовывод, ×</Label>
        <input value={auto} onChange={(e) => setAuto(e.target.value.replace(/[^\d.,]/g, "").slice(0, 8))} disabled={!autoOn} inputMode="decimal" aria-label="Автовывод"
          className={`h-11 w-full rounded-xl border bg-ink px-3 font-mono tabular outline-none focus:border-accent disabled:opacity-50 ${autoOk ? "border-line" : "border-danger/70"}`} />
      </div>
      <ErrorLine text={error} />
      {button}
      <p className="flex items-center gap-2 text-[12px] text-muted"><span className={`size-2 rounded-full ${online ? "bg-accent" : "bg-warn"}`} />{online ? "Онлайн: обновления в реальном времени" : "Переподключение…"}</p>
    </>
  );

  const stage = (
    <div className="grid">
      <div className="flex gap-1.5 overflow-x-auto border-b border-line px-4 py-2.5" aria-label="Прошлые раунды">
        {history.length === 0 && <span className="text-[12px] text-muted">Здесь появятся прошлые раунды</span>}
        {history.map((h) => <span key={h.id} title={`Сид: ${h.serverSeed}`} className={`shrink-0 rounded-md bg-ink px-2 py-1 font-mono text-[12px] font-semibold ${cpTone(h.crashPoint)}`}>{h.crashPoint.toFixed(2)}×</span>)}
      </div>
      <div className="relative h-[300px] overflow-hidden sm:h-[380px]">
        {/* Ночное небо над заснеженной деревней */}
        <NextImage src="/img/ny/bg/crash.webp" alt="" fill sizes="(max-width: 1024px) 100vw, 900px" className="object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/30 via-ink/10 to-ink/70" />
        <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <AnimatePresence mode="wait">
            {status === "BETTING" ? (
              <motion.div key="bet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid w-56 gap-2 text-center">
                <p className="text-[13px] uppercase tracking-wider text-soft">🛷 Санта готовится к взлёту</p>
                <p className="font-display text-[40px] font-bold tabular">{(left / 1000).toFixed(1)}с</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full bg-[linear-gradient(90deg,#e8263f,#ffd166)]" style={{ width: `${(left / 7000) * 100}%` }} /></div>
              </motion.div>
            ) : status === "RUNNING" || status === "CRASHED" ? (
              <motion.div key={`run-${round?.id}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                <span ref={label} className={`font-display text-[56px] font-bold tabular sm:text-[76px] ${status === "CRASHED" ? "text-danger" : "text-white"}`}>{(status === "CRASHED" ? round!.crashPoint! : liveMult).toFixed(2)}×</span>
                {status === "CRASHED" && <p className="font-semibold text-danger">Сани упали в сугроб! ❄️</p>}
              </motion.div>
            ) : (
              <p key="wait" className="text-muted">{status === "DISABLED" ? "Игра временно отключена" : "Подключение…"}</p>
            )}
          </AnimatePresence>
        </div>
      </div>
      {round && <p className="truncate border-t border-line px-4 py-2 font-mono text-[11px] text-muted" title={round.hash}>Хэш сида раунда: {round.hash}</p>}
    </div>
  );

  const players = (
    <Panel>
      <div className="flex items-center justify-between border-b border-line p-3 pl-4">
        <h2 className="font-semibold">Ставки раунда</h2>
        <span className="text-[13px] text-muted">{bets.length} игроков · {points(bets.reduce((s, b) => s + BigInt(b.amount), 0n))}</span>
      </div>
      <ul className="max-h-72 divide-y divide-line/60 overflow-y-auto">
        {bets.length === 0 && <li className="p-5 text-center text-[14px] text-muted">В этом раунде пока нет ставок</li>}
        <AnimatePresence initial={false}>
          {bets.map((b) => (
            <motion.li key={b.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className={`flex items-center gap-3 px-4 py-2 text-[14px] ${b.user === user?.username ? "bg-accent/5" : ""}`}>
              <Avatar name={b.user} avatar={b.avatar} size={24} />
              <span className="min-w-0 flex-1 truncate">{b.user}</span>
              <span className="font-mono tabular text-soft">{points(b.amount)}</span>
              <span className={`w-24 text-right font-mono tabular ${b.status === "WON" ? "text-accent" : b.status === "LOST" ? "text-danger" : "text-muted"}`}>
                {b.status === "WON" ? `${b.multiplier?.toFixed(2)}×` : b.status === "LOST" ? "—" : b.auto ? `авто ${b.auto}×` : "в игре"}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Panel>
  );

  return <GameLayout slug="crash" controls={controls} stage={stage} footer={<div className="grid min-w-0 gap-4 [&>*]:min-w-0">{players}<RoundsPanel slug="crash" version={version} describe={describe} /></div>} />;
}
