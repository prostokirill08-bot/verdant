"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api";
import { points, timeAgo } from "@/lib/format";
import { GAMES, type GameSlug } from "@/lib/games";
import Image from "next/image";

export type GameConfig = { slug: GameSlug; title: string; minBet: string; maxBet: string; edgeBp: number; enabled: boolean };
export type RoundView = {
  id: string; game: string; status: "ACTIVE" | "WON" | "LOST" | "CANCELLED"; bet: string; payout: string; multiplier: number;
  params: Record<string, unknown>; result: Record<string, unknown> | null; state: Record<string, unknown>; createdAt: string; nonce: number | null;
  fair: { serverSeedHash: string; clientSeed: string; nonce: number | null; serverSeed: string | null; crashPoint?: number | null } | null;
};

/** Уникальный ключ запроса: повтор с тем же ключом сервер не спишет второй раз. */
export const newKey = () => crypto.randomUUID().replace(/-/g, "");

/** Строка баллов «12,50» → сотые (bigint) или null. */
export function parsePoints(s: string): bigint | null {
  const t = s.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [i, f = ""] = t.split(".");
  return BigInt(i!) * 100n + BigInt((f + "00").slice(0, 2));
}
export const unitsToInput = (u: bigint) => (u % 100n === 0n ? (u / 100n).toString() : `${u / 100n}.${(u % 100n).toString().padStart(2, "0")}`);

/** Запрос к игровому API: блокирует повторный клик, обновляет баланс, показывает ошибку. */
export function useGameRequest() {
  const { setBalance, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useCallback(async <T extends { balance?: string }>(path: string, body?: unknown, opts: { deferBalance?: boolean } = {}): Promise<T | null> => {
    setBusy(true); setError("");
    try {
      const r = await api<T>(path, { method: body === undefined ? "GET" : "POST", body: body ?? undefined });
      if (r.balance !== undefined && !opts.deferBalance) setBalance(r.balance);
      return r;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Нет связи с сервером");
      if (e instanceof ApiError && e.status === 401) void refresh();
      return null;
    } finally { setBusy(false); }
  }, [setBalance, refresh]);
  return { run, busy, error, setError };
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-line bg-panel ${className}`}>{children}</div>;
}

export function Label({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return <div className="mb-1.5 flex items-center justify-between text-[12px] font-medium uppercase tracking-wider text-muted"><span>{children}</span>{aside && <span className="normal-case tracking-normal">{aside}</span>}</div>;
}

export function Segmented<T extends string | number>({ value, options, onChange, disabled }: { value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-1 rounded-xl bg-ink p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup">
      {options.map(([v, t]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} disabled={disabled} onClick={() => onChange(v)}
          className={`h-9 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-50 ${value === v ? "bg-raised text-white shadow" : "text-muted hover:text-white"}`}>{t}</button>
      ))}
    </div>
  );
}

/** Поле суммы ставки с кнопками ½, 2× и «Макс». */
export function BetAmount({ value, onChange, cfg, disabled }: { value: string; onChange: (v: string) => void; cfg: GameConfig; disabled?: boolean }) {
  const { balance, user } = useAuth();
  const units = parsePoints(value);
  const min = BigInt(cfg.minBet), max = BigInt(cfg.maxBet);
  const cap = (u: bigint) => { const lim = user ? (BigInt(balance) < max ? BigInt(balance) : max) : max; return u < min ? min : u > lim ? (lim < min ? min : lim) : u; };
  const err = units === null ? "Неверная сумма" : units < min ? `Минимум ${points(min)}` : units > max ? `Максимум ${points(max)}` : user && units > BigInt(balance) ? "Недостаточно баллов" : "";
  return (
    <div>
      <Label aside={<span className="font-mono text-soft">{units !== null ? points(units) : "—"}</span>}>Ставка</Label>
      <div className={`flex items-center gap-1 rounded-xl border bg-ink p-1 focus-within:border-accent ${err ? "border-danger/70" : "border-line"}`}>
        <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, "").slice(0, 12))} disabled={disabled} inputMode="decimal" aria-label="Сумма ставки" aria-invalid={!!err}
          className="h-9 w-0 min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[15px] tabular outline-none disabled:opacity-60" />
        {([["½", (u: bigint) => u / 2n], ["2×", (u: bigint) => u * 2n], ["Макс", () => max * 1000n]] as const).map(([t, f]) => (
          <button key={t} type="button" disabled={disabled} onClick={() => onChange(unitsToInput(cap(f(units ?? min))))}
            className="h-9 rounded-lg bg-raised px-2.5 text-[12.5px] font-semibold text-soft hover:text-white disabled:opacity-50">{t}</button>
        ))}
      </div>
      {err && <p className="mt-1 text-[12px] text-danger">{err}</p>}
    </div>
  );
}
export function betError(value: string, cfg: GameConfig, balance: string): string {
  const u = parsePoints(value);
  if (u === null) return "Неверная сумма";
  if (u < BigInt(cfg.minBet) || u > BigInt(cfg.maxBet)) return "Сумма вне лимитов";
  if (u > BigInt(balance)) return "Недостаточно баллов";
  return "";
}

/** Главная кнопка игры. Без входа ведёт на страницу входа. */
export function PlayButton({ children, onClick, disabled, loading, variant = "primary" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean; variant?: "primary" | "danger" | "secondary" }) {
  const { user, loading: authLoading } = useAuth();
  const path = usePathname();
  if (!authLoading && !user) return <Link href={`/login?next=${encodeURIComponent(path)}`} className="block"><Button size="lg" className="w-full">Войти, чтобы играть</Button></Link>;
  return <Button size="lg" variant={variant} className="w-full" onClick={onClick} disabled={disabled || authLoading} loading={loading}>{children}</Button>;
}

export function ErrorLine({ text }: { text: string }) {
  return <AnimatePresence>{text && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl bg-danger/10 px-3 py-2 text-[13px] text-danger" role="alert">{text}</motion.p>}</AnimatePresence>;
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "accent" | "danger" }) {
  return (
    <div className="min-w-0 rounded-xl bg-ink px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`truncate font-mono text-[14px] font-semibold tabular ${tone === "accent" ? "text-accent" : tone === "danger" ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}

/** Макет страницы игры: панель управления слева (снизу на телефоне), сцена справа, ниже — история. */
export function GameLayout({ controls, stage, footer, slug }: { controls: React.ReactNode; stage: React.ReactNode; footer?: React.ReactNode; slug?: GameSlug }) {
  const meta = slug ? GAMES[slug] : null;
  return (
    <div className="grid min-w-0 gap-4 [&>*]:min-w-0">
      <Panel className="grid min-w-0 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="order-2 grid min-w-0 content-start gap-4 border-t border-line p-4 lg:order-1 lg:border-r lg:border-t-0 [&>*]:min-w-0">{controls}</div>
        <div className="relative order-1 min-w-0 lg:order-2">
          {/* Атмосфера игры: размытая обложка и свечение в её цветах под игровым полем */}
          {meta && (
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <Image src={meta.cover} alt="" fill sizes="60vw" className="scale-125 object-cover opacity-30 blur-2xl" />
              <div className="absolute inset-0" style={{ background: `radial-gradient(70% 60% at 50% 0%, ${meta.theme[0]}33, transparent 70%), linear-gradient(180deg, transparent, var(--color-panel) 95%)` }} />
            </div>
          )}
          <div className="relative">{stage}</div>
        </div>
      </Panel>
      {footer}
    </div>
  );
}

// ---------- История раундов ----------
type PublicRow = { id: string; user: string; avatar: string; bet: string; payout: string; multiplier: number; status: string; at: string };

export function RoundsPanel({ slug, version, describe }: { slug: GameSlug; version: number; describe: (r: RoundView) => string }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"mine" | "all">(user ? "mine" : "all");
  const userId = user?.publicId;
  const [mine, setMine] = useState<RoundView[]>([]); const [all, setAll] = useState<PublicRow[]>([]);
  const [open, setOpen] = useState<RoundView | null>(null);
  // Как только известен игрок — по умолчанию показываем его ставки
  useEffect(() => { setTab(userId ? "mine" : "all"); }, [userId]);
  useEffect(() => {
    let off = false;
    const load = () => {
      if (tab === "mine" && user) api<{ rounds: RoundView[] }>(`/api/games/${slug}/rounds?scope=mine`).then((r) => !off && setMine(r.rounds)).catch(() => {});
      if (tab === "all") api<{ rounds: PublicRow[] }>(`/api/games/${slug}/rounds?scope=all`).then((r) => !off && setAll(r.rounds)).catch(() => {});
    };
    load();
    const t = tab === "all" ? setInterval(load, 8000) : undefined;
    return () => { off = true; if (t) clearInterval(t); };
  }, [slug, tab, user, version]);

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 border-b border-line p-3 pl-4">
        <h2 className="font-semibold">История</h2>
        <div className="w-full max-w-60"><Segmented value={tab} onChange={setTab} options={user ? [["mine", "Мои ставки"], ["all", "Все игроки"]] : [["all", "Все игроки"]]} /></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[14px]">
          <thead><tr className="text-left text-[12px] uppercase tracking-wider text-muted">
            <th className="px-4 py-2.5 font-medium">{tab === "mine" ? "Результат" : "Игрок"}</th><th className="px-4 py-2.5 text-right font-medium">Ставка</th>
            <th className="px-4 py-2.5 text-right font-medium">Множитель</th><th className="px-4 py-2.5 text-right font-medium">Выплата</th><th className="px-4 py-2.5 text-right font-medium">Когда</th>
          </tr></thead>
          <tbody>
            {tab === "mine" ? mine.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r)} className="cursor-pointer border-t border-line/60 hover:bg-raised/40">
                <td className="px-4 py-2.5 text-soft">{describe(r)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular">{points(r.bet)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular">{r.multiplier.toFixed(2)}×</td>
                <td className={`px-4 py-2.5 text-right font-mono tabular ${BigInt(r.payout) > 0n ? "text-accent" : "text-muted"}`}>{points(r.payout)}</td>
                <td className="px-4 py-2.5 text-right text-muted">{timeAgo(r.createdAt)}</td>
              </tr>
            )) : all.map((r) => (
              <tr key={r.id} className="border-t border-line/60">
                <td className="px-4 py-2.5"><span className="flex items-center gap-2"><Avatar name={r.user} avatar={r.avatar} size={22} />{r.user}</span></td>
                <td className="px-4 py-2.5 text-right font-mono tabular">{points(r.bet)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular">{r.multiplier.toFixed(2)}×</td>
                <td className={`px-4 py-2.5 text-right font-mono tabular ${BigInt(r.payout) > 0n ? "text-accent" : "text-muted"}`}>{points(r.payout)}</td>
                <td className="px-4 py-2.5 text-right text-muted">{timeAgo(r.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(tab === "mine" ? mine : all).length === 0 && <p className="p-6 text-center text-[14px] text-muted">Раундов пока нет.</p>}
      </div>
      <RoundModal round={open} onClose={() => setOpen(null)} describe={describe} />
    </Panel>
  );
}

/** Ссылка на страницу проверки с заполненными полями. */
export function verifyHref(r: RoundView) {
  if (!r.fair) return "/fair";
  const q = new URLSearchParams({ game: r.game, s: r.fair.serverSeed ?? "", c: r.fair.clientSeed, n: String(r.fair.nonce ?? 0) });
  for (const [k, v] of Object.entries(r.params)) if (typeof v !== "object") q.set(`p_${k}`, String(v));
  return `/fair?${q}`;
}

function RoundModal({ round, onClose, describe }: { round: RoundView | null; onClose: () => void; describe: (r: RoundView) => string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <AnimatePresence>
      {round && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal aria-label="Раунд" onClick={(e) => e.stopPropagation()} initial={{ y: 16, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16 }}
            className="w-full max-w-md rounded-3xl border border-line bg-panel p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[12px] uppercase tracking-wider text-muted">Раунд</p><p className="font-mono text-[13px] text-soft">{round.id}</p></div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-white" aria-label="Закрыть">✕</button>
            </div>
            <p className="mt-3 font-semibold">{describe(round)}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Ставка" value={points(round.bet)} />
              <Stat label="Множитель" value={`${round.multiplier.toFixed(2)}×`} />
              <Stat label="Выплата" value={points(round.payout)} tone={BigInt(round.payout) > 0n ? "accent" : undefined} />
            </div>
            {round.fair && (
              <div className="mt-4 grid gap-2 rounded-2xl bg-ink p-3 text-[12.5px]">
                <p className="font-semibold text-soft">Честность</p>
                <Row k="Хэш серверного сида" v={round.fair.serverSeedHash} />
                <Row k="Серверный сид" v={round.fair.serverSeed ?? "скрыт до смены пары сидов"} />
                <Row k="Клиентский сид" v={round.fair.clientSeed} />
                <Row k="Nonce" v={String(round.fair.nonce ?? 0)} />
                {round.fair.serverSeed
                  ? <Link href={verifyHref(round)} className="mt-1 text-accent hover:underline">Проверить результат →</Link>
                  : <Link href="/fair" className="mt-1 text-accent hover:underline">Сменить пару сидов, чтобы проверить →</Link>}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => <div><p className="text-muted">{k}</p><p className="break-all font-mono text-soft">{v}</p></div>;
