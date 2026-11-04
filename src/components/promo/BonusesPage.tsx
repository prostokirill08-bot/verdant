"use client";
import { sfx } from "@/lib/sound";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { Countdown } from "@/components/home/Countdown";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api";
import { points, timeAgo } from "@/lib/format";
import { GAMES, isGameSlug } from "@/lib/games";

type Summary = {
  keys: { have: number; need: number; perWager: string; minBet: string; opened: number };
  jackpot: { pool: string; base: string };
  chest: { amount: string; chance: number }[];
  tournament: { week: string; startsAt: string; endsAt: string; prizes: string[]; top: { place: number; user: string; avatar: string; mult: number; game: string; prize: string }[]; me: { place: number | null; best: number | null } | null };
  wins: { id: string; kind: string; amount: string; place: number | null; at: string; user: string; avatar: string }[];
};
type Opened = { prize: string; grand: boolean; keys: number; balance: string };
const MEDAL = ["🥇", "🥈", "🥉"];

/** Сумма джекпота «тикает» вверх — плавно, без перерисовки React на каждом кадре. */
function Ticker({ value }: { value: bigint }) {
  const el = useRef<HTMLSpanElement>(null); const shown = useRef<number>(Number(value));
  useEffect(() => {
    const from = shown.current, to = Number(value); const t0 = performance.now(); let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 1200); shown.current = from + (to - from) * k; if (el.current) el.current.textContent = points(BigInt(Math.round(shown.current))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span ref={el}>{points(value)}</span>;
}

export function BonusesPage() {
  const { user, setBalance } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [opened, setOpened] = useState<Opened | null>(null);
  const load = useCallback(() => api<Summary>("/api/promo").then(setData).catch(() => {}), []);
  useEffect(() => { void load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load, user]);

  async function open() {
    setBusy(true); setErr("");
    try {
      const r = await api<Opened>("/api/promo/chest", { method: "POST", body: {} });
      window.dispatchEvent(new Event("vd:keys-reset"));
      setOpened(r); setTimeout(() => setBalance(r.balance), 2600); void load();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Не удалось открыть сундук"); }
    finally { setBusy(false); }
  }

  const k = data?.keys; const full = !!k && k.have >= k.need;
  const t = data?.tournament;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div>
        <h1 className="font-display text-[28px] font-bold">Бонусы <span className="text-gradient">и турнир</span></h1>
        <p className="mt-1 text-muted">Все призы — в демо-рублях: их нельзя купить или вывести.</p>
      </div>

      {/* ---------- Сундук с ключами ---------- */}
      <section id="chest" className="relative scroll-mt-24 overflow-hidden rounded-[28px] border border-line bg-[#06140b]">
        <Image src="/img/verdant/banners/chest.webp" alt="" fill sizes="(max-width: 1024px) 100vw, 1000px" className="object-cover object-[75%_center] opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/80 to-ink/10" />
        <div className="relative grid gap-5 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid content-start gap-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#52e994]">🔑 Акция · изумрудные ключи</p>
            <h2 className="font-display text-[clamp(24px,4vw,36px)] font-bold leading-tight">Изумрудный сундук</h2>
            <p className="max-w-lg text-[15px] text-white/80">Ключ выпадает за ставки в любой игре — в среднем 1 ключ на каждые {k ? points(k.perWager) : "2 000 ₽"} ставок: чем больше ставка, тем выше шанс. Собери {k?.need ?? 4} ключа и открой сундук: внутри приз или весь джекпот.</p>
            <div className="mt-1 w-fit rounded-2xl bg-black/40 px-4 py-3 ring-1 ring-gold/40">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold/80">Джекпот сундука</p>
              <p className="font-display text-[clamp(28px,6vw,44px)] font-bold text-gold [text-shadow:0_0_24px_#ffb02e80]" data-testid="jackpot">{data ? <Ticker value={BigInt(data.jackpot.pool)} /> : "…"}</p>
              <p className="text-[12px] text-white/60">0,5% каждой ставки всех игроков пополняет джекпот</p>
            </div>
          </div>
          <div className="grid content-start gap-3 rounded-3xl bg-black/45 p-4 ring-1 ring-white/10 backdrop-blur">
            <p className="text-[13px] font-semibold text-soft">Твои ключи</p>
            <div className="grid grid-cols-4 gap-2" data-testid="key-slots">
              {Array.from({ length: k?.need ?? 4 }, (_, i) => {
                const on = !!k && i < k.have;
                return (
                  <motion.div key={i} initial={false} animate={on ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                    className={`grid aspect-square place-items-center rounded-2xl text-[28px] ring-2 ${on ? "bg-[radial-gradient(circle,#ffd16655,transparent_70%)] ring-gold" : "bg-white/5 ring-white/10 grayscale opacity-40"}`}>🔑</motion.div>
                );
              })}
            </div>
            {user ? (
              <Button size="lg" className={`w-full ${full ? "btn-shine" : ""}`} disabled={!full} loading={busy} onClick={open} data-testid="open-chest">
                {full ? "Открыть сундук" : `Собрано ${k?.have ?? 0} из ${k?.need ?? 4}`}
              </Button>
            ) : <Link href="/register?next=/bonuses" className="block"><Button size="lg" className="w-full">Зарегистрироваться и собирать</Button></Link>}
            {err && <p className="text-[13px] text-danger">{err}</p>}
            <div className="grid grid-cols-3 gap-1.5 text-center text-[12px]">
              {data?.chest.map((p) => (
                <div key={p.amount} className={`rounded-xl px-1 py-1.5 ${p.amount === "grand" ? "col-span-3 bg-gold/15 text-gold ring-1 ring-gold/40" : "bg-white/5 text-soft"}`}>
                  <p className="font-mono font-bold">{p.amount === "grand" ? "ДЖЕКПОТ" : points(p.amount)}</p>
                  <p className="text-[10.5px] text-muted">{(p.chance * 100).toFixed(p.chance < 0.05 ? 1 : 0)}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Турнир недели ---------- */}
      <section id="tournament" className="scroll-mt-24 overflow-hidden rounded-[28px] border border-line bg-panel">
        <div className="relative min-h-[220px] overflow-hidden">
          <Image src="/img/verdant/banners/tournament.webp" alt="" fill sizes="(max-width: 1024px) 100vw, 1000px" className="object-cover object-[80%_center]" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-transparent" />
          <div className="relative grid gap-3 p-5 sm:p-8">
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gold">🏆 Турнир недели</p>
            <h2 className="font-display text-[clamp(24px,4vw,36px)] font-bold leading-tight">Emerald Challenge</h2>
            <p className="max-w-lg text-[15px] text-white/80">Побеждает самый крупный множитель одного выигрыша за неделю (ставка от 1 ₽, любая игра). Призы начисляются автоматически в понедельник.</p>
            {t && <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">До конца турнира</p><Countdown to={t.endsAt} label="До конца турнира" compact /></div>}
          </div>
        </div>
        <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="grid content-start gap-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Призы</p>
            {t?.prizes.slice(0, 3).map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-ink px-3 py-2"><span className="text-[18px]">{MEDAL[i]}</span><span className="font-mono font-bold text-gold">{points(p)}</span></div>
            ))}
            {t && <div className="flex items-center justify-between rounded-xl bg-ink px-3 py-2 text-[13px]"><span className="text-soft">4–10 место</span><span className="font-mono font-bold">{points(t.prizes[3]!)}</span></div>}
            {t?.me && (
              <div className="mt-1 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[13px]" data-testid="my-place">
                <p className="text-muted">Твой результат</p>
                <p className="font-semibold">{t.me.place ? `${t.me.place} место · ${t.me.best?.toFixed(2)}×` : t.me.best ? `${t.me.best.toFixed(2)}× — пока вне десятки` : "Пока нет выигрышей на этой неделе"}</p>
              </div>
            )}
            {!user && <p className="text-[12.5px] text-muted">Демо-гости в турнире не участвуют — <Link href="/register?next=/bonuses" className="text-accent underline">зарегистрируйся</Link>.</p>}
          </div>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[440px] text-[14px]" data-testid="leaderboard">
              <thead><tr className="text-left text-[11.5px] uppercase tracking-wider text-muted"><th className="px-3 py-2 font-medium">#</th><th className="px-3 py-2 font-medium">Игрок</th><th className="px-3 py-2 font-medium">Игра</th><th className="px-3 py-2 text-right font-medium">Множитель</th><th className="px-3 py-2 text-right font-medium">Приз</th></tr></thead>
              <tbody>
                {t?.top.map((r) => (
                  <tr key={r.place} className={`border-t border-line/60 ${r.place <= 3 ? "bg-gold/[0.04]" : ""}`}>
                    <td className="px-3 py-2.5 font-bold">{MEDAL[r.place - 1] ?? r.place}</td>
                    <td className="px-3 py-2.5"><span className="flex items-center gap-2"><Avatar name={r.user} avatar={r.avatar} size={24} />{r.user}</span></td>
                    <td className="px-3 py-2.5 text-soft">{isGameSlug(r.game) ? GAMES[r.game].name : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-accent">{r.mult.toFixed(2)}×</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gold">{points(r.prize)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {t && !t.top.length && <p className="p-6 text-center text-muted">На этой неделе ещё никто не выиграл — стань первым!</p>}
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ---------- Подарок дня ---------- */}
        <section className="snow-cap relative overflow-hidden rounded-[28px] border border-line bg-[linear-gradient(120deg,#16245e,#0f1633_55%,#4a0f22)] p-6">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gold">🎁 Каждый день</p>
          <h2 className="mt-1 font-display text-[22px] font-bold">Подарок дня от Котонавта</h2>
          <p className="mt-1 max-w-xs text-[14px] text-white/75">Раз в сутки забирай демо-рубли в кабинете.</p>
          <Link href={user ? "/account" : "/register"} className="mt-4 inline-block"><Button>{user ? "Забрать подарок" : "Начать играть"}</Button></Link>
          <Image src="/img/verdant/covers/coinflip.webp" alt="" width={200} height={200} className="pointer-events-none absolute -bottom-4 right-0 w-[130px] [mask-image:radial-gradient(circle,#000_55%,transparent_72%)]" />
        </section>
        {/* ---------- Последние призы ---------- */}
        <section className="rounded-[28px] border border-line bg-panel p-5">
          <h2 className="font-semibold">Последние призы</h2>
          <div className="mt-3 grid gap-1.5">
            {data?.wins.length ? data.wins.map((w) => (
              <div key={w.id} className="flex items-center gap-2.5 rounded-xl bg-ink px-3 py-2 text-[13.5px]">
                <Avatar name={w.user} avatar={w.avatar} size={22} />
                <span className="min-w-0 flex-1 truncate">{w.user} <span className="text-muted">· {w.kind === "grand" ? "🎉 джекпот сундука" : w.kind === "tournament" ? `🏆 ${w.place} место в турнире` : "🔑 сундук"}</span></span>
                <span className="font-mono font-semibold text-gold">+{points(w.amount)}</span>
                <span className="hidden text-[12px] text-muted sm:inline">{timeAgo(w.at)}</span>
              </div>
            )) : <p className="text-[14px] text-muted">Пока пусто — открой сундук первым.</p>}
          </div>
        </section>
      </div>
      <ChestReveal opened={opened} onClose={() => setOpened(null)} />
    </div>
  );
}

/** Открытие сундука: тряска → вспышка → приз. */
function ChestReveal({ opened, onClose }: { opened: Opened | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false); const [stage, setStage] = useState(0);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!opened) return; setStage(0);
    // тряска сундука — скрип и барабанная дробь, затем приз: джекпот, крупный или обычный
    sfx("chest"); for (let k = 0; k < 6; k++) sfx("tick", { delay: 200 + k * 200, pitch: 0.5 + k * 0.08 });
    const a = setTimeout(() => { setStage(1); if (opened.grand) sfx("jackpot"); else if (Number(opened.prize) >= 25_000) sfx("bigwin"); else sfx("coins"); }, 1500);
    return () => clearTimeout(a);
  }, [opened]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {opened && (
        <motion.div className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => stage === 1 && onClose()} data-testid="chest-reveal">
          <div className="relative grid w-full max-w-sm place-items-center gap-4 text-center">
            <div aria-hidden className={`absolute left-1/2 top-[30%] size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_0deg,#ffd16600,#ffd16655,#ffd16600,#ffd16655,#ffd16600,#ffd16655,#ffd16600)] transition-opacity duration-500 ${stage ? "bw-rays opacity-100" : "opacity-0"}`} />
            <motion.div animate={stage === 0 ? { rotate: [0, -6, 6, -8, 8, -4, 4, 0], scale: [1, 1.04, 1, 1.06, 1, 1.08, 1.1] } : { scale: [1.1, 1.3, 1], rotate: 0 }}
              transition={stage === 0 ? { duration: 1.5 } : { duration: 0.5 }} className="relative text-[120px] leading-none drop-shadow-[0_0_40px_#ffd16680]">{stage ? "🎉" : "🎁"}</motion.div>
            <AnimatePresence>
              {stage === 1 && (
                <motion.div initial={{ opacity: 0, y: 20, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative grid gap-1">
                  <p className="font-display text-[15px] font-bold uppercase tracking-[0.2em] text-[#52e994]">{opened.grand ? "Джекпот!" : "Твой приз"}</p>
                  <p className="font-display text-[44px] font-bold text-gold [text-shadow:0_0_30px_#ffb02e]" data-testid="chest-prize">+{points(opened.prize)}</p>
                  <p className="text-[13px] text-white/70">Начислено на баланс · нажми, чтобы закрыть</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
