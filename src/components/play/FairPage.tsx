"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api";
import { browserFloats, sha256Hex } from "@/lib/fair/browser";
import * as O from "@/lib/fair/outcomes";
import { playAtlas, playNeon, rngFromArray, SLOT_FLOATS } from "@/lib/fair/slots";
import * as X from "@/lib/fair/extra";
import { GAME_NAMES, GAME_SLUGS, isGameSlug, type GameSlug } from "@/lib/games";
import { ErrorLine, Label, Panel, Segmented } from "./kit";

type Info = { current: { serverSeedHash: string; clientSeed: string; nonce: number } | null; revealed: { serverSeed: string; serverSeedHash: string; clientSeed: string; rounds: number; revealedAt: string }[] };

export function FairPage() {
  const { user } = useAuth();
  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <div>
        <h1 className="font-display text-[26px] font-bold">Проверка честности</h1>
        <p className="mt-1 max-w-2xl text-muted">Результат каждого раунда — это HMAC-SHA256 от серверного сида, твоего клиентского сида и номера раунда (nonce). Хэш серверного сида виден до игры, сам сид раскрывается при смене пары — после этого любой раунд можно пересчитать здесь, прямо в браузере.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] [&>*]:min-w-0">
        {user ? <Seeds /> : <Panel className="p-5 text-muted">Войди в аккаунт, чтобы управлять своей парой сидов. Проверять раунды можно и без входа.</Panel>}
        <Verifier />
      </div>
      <Panel className="p-5 text-[14px] leading-relaxed text-soft">
        <h2 className="mb-2 font-semibold text-white">Как устроено</h2>
        <ol className="grid list-decimal gap-1.5 pl-5">
          <li>Сервер генерирует серверный сид криптостойким ГСЧ (crypto.randomBytes) и показывает его SHA-256 хэш.</li>
          <li>Ты задаёшь клиентский сид — сервер не может подобрать результат под него заранее.</li>
          <li>Для раунда № nonce считается HMAC_SHA256(serverSeed, «clientSeed:nonce:cursor»), каждые 4 байта дают число от 0 до 1.</li>
          <li>Числа превращаются в результат по открытым формулам: бросок Dice, множитель Limbo, путь шарика Plinko, расстановка мин, номер рулетки.</li>
          <li>Crash — общий раунд для всех: его хэш показан до приёма ставок, а сид раскрывается сразу после обвала.</li>
        </ol>
      </Panel>
    </div>
  );
}

function Seeds() {
  const [info, setInfo] = useState<Info | null>(null);
  const [seed, setSeed] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const load = useCallback(() => api<Info>("/api/fair").then(setInfo).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  async function rotate() {
    setBusy(true); setErr("");
    try { setInfo(await api<Info>("/api/fair", { body: seed.trim() ? { clientSeed: seed.trim() } : {} })); setSeed(""); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Ошибка"); } finally { setBusy(false); }
  }
  return (
    <Panel className="grid content-start gap-4 p-5">
      <h2 className="font-semibold">Твоя пара сидов</h2>
      {info?.current ? (
        <div className="grid gap-2 rounded-2xl bg-ink p-3 text-[13px]">
          <Kv k="Хэш серверного сида" v={info.current.serverSeedHash} />
          <Kv k="Клиентский сид" v={info.current.clientSeed} />
          <Kv k="Следующий nonce" v={String(info.current.nonce)} />
        </div>
      ) : <p className="text-[14px] text-muted">Пара создаётся при первой игре.</p>}
      <div>
        <Label>Новый клиентский сид (необязательно)</Label>
        <div className="flex gap-2">
          <input value={seed} onChange={(e) => setSeed(e.target.value.slice(0, 64))} placeholder="случайный, если пусто" className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 font-mono text-[14px] outline-none focus:border-accent" />
          <Button onClick={rotate} loading={busy}>Сменить пару</Button>
        </div>
        <p className="mt-1.5 text-[12px] text-muted">Смена раскроет текущий серверный сид — раунды на нём станут проверяемыми.</p>
      </div>
      <ErrorLine text={err} />
      {!!info?.revealed.length && (
        <div className="grid gap-2">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted">Раскрытые пары</p>
          {info.revealed.map((p) => (
            <div key={p.serverSeedHash} className="grid gap-1 rounded-xl bg-ink p-3 text-[12.5px]">
              <Kv k="Серверный сид" v={p.serverSeed} />
              <Kv k="Клиентский сид · раундов" v={`${p.clientSeed} · ${p.rounds}`} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

type Out = { hashOk: string; lines: [string, string][] };

function Verifier() {
  const sp = useSearchParams();
  const [game, setGame] = useState<GameSlug>(() => { const g = sp.get("game") ?? ""; return isGameSlug(g) ? g : "dice"; });
  const [s, setS] = useState(sp.get("s") ?? ""); const [c, setC] = useState(sp.get("c") ?? "");
  const [n, setN] = useState(sp.get("n") ?? "0");
  const [p, setP] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = { target: "50", over: "true", rows: "12", risk: "medium", mines: "3", edgeBp: "100" };
    sp.forEach((v, k) => { if (k.startsWith("p_")) o[k.slice(2)] = v; }); return o;
  });
  const [out, setOut] = useState<Out | null>(null); const [err, setErr] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP((x) => ({ ...x, [k]: e.target.value }));

  const compute = useCallback(async () => {
    setErr(""); setOut(null);
    if (!s.trim()) return;
    if (!window.crypto?.subtle) { setErr("Браузер не поддерживает WebCrypto (нужен HTTPS)"); return; }
    const edge = Number(p.edgeBp) || 0; const nonce = Number(n) || 0;
    const slot = game === "atlas" || game === "neon-garden";
    const EXTRA: Record<string, number> = { coinflip: X.COIN_MAX_FLIPS, wheel: 1, keno: 10, tower: X.TOWER_FLOATS, hilo: X.HILO_MAX_CARDS };
    const need = game === "crash" ? 1 : slot ? SLOT_FLOATS : EXTRA[game] ?? O.FLOATS_NEEDED[game as keyof typeof O.FLOATS_NEEDED];
    const fs = game === "crash" ? await browserFloats(s.trim(), "crash", 0, 1) : await browserFloats(s.trim(), c.trim(), nonce, need);
    if (slot) {
      const r = (game === "atlas" ? playAtlas : playNeon)(rngFromArray(fs), { buy: p.buy === "true" });
      const lines: [string, string][] = [["Итоговый множитель", `${r.totalMult}×`]];
      if (r.fs) lines.push(["Бонус", `${r.fs.spins.length} бесплатных вращений${"special" in r.fs ? `, особый символ: ${r.fs.special}` : `, выигрыши ×${r.fs.x}`}`]);
      if (r.base) lines.push(["Выигрыш обычного вращения", `${r.base.mult}×`]);
      setOut({ hashOk: await sha256Hex(s.trim()), lines }); return;
    }
    const lines: [string, string][] = [];
    if (game === "dice") { const roll = O.diceRoll(fs[0]!); const t = Number(p.target), over = p.over === "true"; lines.push(["Бросок", roll.toFixed(2)], ["Итог", `${O.diceWin(roll, t, over) ? "выигрыш" : "проигрыш"} (${over ? ">" : "<"} ${t})`]); }
    if (game === "limbo") lines.push(["Множитель", `${O.limboResult(fs[0]!, edge).toFixed(2)}×`]);
    if (game === "crash") lines.push(["Точка обвала", `${O.crashPoint(fs[0]!, edge).toFixed(2)}×`]);
    if (game === "roulette") { const x = O.rouletteNumber(fs[0]!); lines.push(["Число", `${x} (${O.rouletteColor(x) === "red" ? "красное" : O.rouletteColor(x) === "black" ? "чёрное" : "зеро"})`]); }
    if (game === "plinko") {
      const rows = Number(p.rows) as O.PlinkoRows; const risk = p.risk as O.PlinkoRisk;
      if (!O.PLINKO_TABLE[rows]?.[risk]) { setErr("Неверные ряды или риск"); return; }
      const { path, bucket } = O.plinkoPath(fs, rows);
      lines.push(["Путь", path.map((x) => (x ? "→" : "←")).join(" ")], ["Лунка", String(bucket + 1)], ["Множитель", `${O.PLINKO_TABLE[rows][risk][bucket]}×`]);
    }
    if (game === "coinflip") { const n = Math.min(10, Math.max(1, Number(p.flips) || 1)); lines.push(["Броски", X.coinSides(fs, n).map((x) => (x === "heads" ? "орёл" : "решка")).join(", ")]); }
    if (game === "wheel") { const r = (X.WHEEL_RISKS as readonly string[]).includes(p.risk!) ? (p.risk as X.WheelRisk) : "medium"; const seg = X.wheelSegment(fs[0]!); lines.push(["Сектор", String(seg + 1)], ["Множитель", `${X.WHEEL[r][seg]}×`]); }
    if (game === "keno") lines.push(["Выпавшие числа", X.kenoDraw(fs).sort((a, b) => a - b).join(", ")]);
    if (game === "tower") { const lv = (p.level && p.level in X.TOWER_LEVELS ? p.level : "medium") as X.TowerLevel; X.towerLayout(fs, lv).forEach((t, i) => lines.push([`Этаж ${i + 1}: ловушки`, t.map((x) => x + 1).join(", ")])); }
    if (game === "hilo") lines.push(["Карты по порядку", fs.slice(0, 20).map((f) => X.RANK_LABEL[X.hiloCard(f).rank]).join(" ") + " …"]);
    if (game === "mines") { const m = Math.min(24, Math.max(1, Number(p.mines) || 3)); const l = O.minesLayout(fs, m); lines.push(["Мины (клетки 1–25)", l.map((x) => x + 1).join(", ")]); }
    setOut({ hashOk: await sha256Hex(s.trim()), lines });
  }, [game, s, c, n, p]);

  useEffect(() => { void compute(); }, [compute]);
  const inp = "h-10 w-full min-w-0 rounded-xl border border-line bg-ink px-3 font-mono text-[13.5px] outline-none focus:border-accent";

  return (
    <Panel className="grid content-start gap-4 p-5">
      <h2 className="font-semibold">Проверить раунд</h2>
      <select value={game} onChange={(e) => setGame(e.target.value as GameSlug)} className={inp} aria-label="Игра">
        {GAME_SLUGS.map((g) => <option key={g} value={g}>{GAME_NAMES[g]}</option>)}
      </select>
      <label className="grid gap-1"><Label>Серверный сид</Label><input value={s} onChange={(e) => setS(e.target.value)} className={inp} placeholder="раскрытый серверный сид" /></label>
      {game !== "crash" && (
        <div className="grid grid-cols-[1fr_100px] gap-2">
          <label className="grid gap-1"><Label>Клиентский сид</Label><input value={c} onChange={(e) => setC(e.target.value)} className={inp} /></label>
          <label className="grid gap-1"><Label>Nonce</Label><input value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} className={inp} inputMode="numeric" /></label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {game === "dice" && <>
          <label className="grid gap-1"><Label>Порог</Label><input value={p.target} onChange={set("target")} className={inp} /></label>
          <div><Label>Направление</Label><Segmented value={p.over!} onChange={(v) => setP((x) => ({ ...x, over: v }))} options={[["false", "<"], ["true", ">"]]} /></div>
        </>}
        {game === "plinko" && <>
          <label className="grid gap-1"><Label>Ряды</Label><select value={p.rows} onChange={set("rows")} className={inp}>{O.PLINKO_ROWS.map((r) => <option key={r}>{r}</option>)}</select></label>
          <label className="grid gap-1"><Label>Риск</Label><select value={p.risk} onChange={set("risk")} className={inp}>{O.PLINKO_RISKS.map((r) => <option key={r} value={r}>{r === "low" ? "низкий" : r === "medium" ? "средний" : "высокий"}</option>)}</select></label>
        </>}
        {(game === "atlas" || game === "neon-garden") && <div><Label>Покупка бонуса</Label><Segmented value={p.buy ?? "false"} onChange={(v) => setP((x) => ({ ...x, buy: v }))} options={[["false", "Нет"], ["true", "Да"]]} /></div>}
        {game === "coinflip" && <label className="grid gap-1"><Label>Бросков</Label><input value={p.flips ?? "1"} onChange={set("flips")} className={inp} /></label>}
        {game === "wheel" && <label className="grid gap-1"><Label>Риск</Label><select value={p.risk} onChange={set("risk")} className={inp}><option value="low">низкий</option><option value="medium">средний</option><option value="high">высокий</option></select></label>}
        {game === "tower" && <label className="grid gap-1"><Label>Сложность</Label><select value={p.level ?? "medium"} onChange={set("level")} className={inp}>{Object.entries(X.TOWER_LEVELS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></label>}
        {game === "mines" && <label className="grid gap-1"><Label>Мин</Label><input value={p.mines} onChange={set("mines")} className={inp} /></label>}
        {(game === "limbo" || game === "crash" || game === "dice") && <label className="grid gap-1"><Label>Преимущество, б.п.</Label><input value={p.edgeBp} onChange={set("edgeBp")} className={inp} /></label>}
      </div>
      <ErrorLine text={err} />
      {out ? (
        <div className="grid gap-2 rounded-2xl bg-ink p-4 text-[13px]">
          <Kv k="SHA-256 серверного сида (сравни с хэшем, показанным до игры)" v={out.hashOk} />
          {out.lines.map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-3 border-t border-line/60 pt-2"><span className="text-muted">{k}</span><span className="text-right font-mono text-[15px] font-semibold text-white">{v}</span></div>)}
        </div>
      ) : <p className="text-[14px] text-muted">Вставь серверный сид — результат посчитается автоматически.</p>}
    </Panel>
  );
}

const Kv = ({ k, v }: { k: string; v: string }) => <div><p className="text-muted">{k}</p><p className="break-all font-mono text-soft">{v}</p></div>;
