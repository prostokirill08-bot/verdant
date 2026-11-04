"use client";
import { sfx } from "@/lib/sound";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { points } from "@/lib/format";

type Summary = {
  user: { publicId: string; username: string; email: string; avatar: string; role: string; createdAt: string };
  balance: string; bonus: { amount: string; availableAt: string | null };
  stats: { rounds: number; wins: number; wagered: string; returned: string; bestMultiplier: string };
};

export default function AccountPage() {
  const { setBalance } = useAuth();
  const [s, setS] = useState<Summary | null>(null); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const [check, setCheck] = useState<{ ok: boolean; balance: string; ledger: string } | null>(null);
  const load = useCallback(async () => { try { setS(await api<Summary>("/api/account/profile")); } catch (e) { setErr((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function bonus() {
    setBusy(true); setMsg("");
    try { const r = await api<{ balance: string }>("/api/account/bonus", { method: "POST" }); setBalance(r.balance); sfx("coins"); setMsg(`Начислено ${points(s!.bonus.amount)}`); await load(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  async function verify() { try { setCheck(await api("/api/account/verify")); } catch (e) { setMsg((e as Error).message); } }

  if (err) return <p className="text-danger">{err}</p>;
  if (!s) return <div className="h-60 animate-pulse rounded-3xl bg-panel" />;
  const net = BigInt(s.stats.returned) - BigInt(s.stats.wagered);
  return (
    <div className="verdant-account grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-accent/15 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-4">
          <Avatar name={s.user.username} avatar={s.user.avatar} size={56} />
          <div className="min-w-0"><p className="truncate text-[20px] font-semibold">{s.user.username}</p>
            <p className="font-mono text-[13px] text-muted">ID {s.user.publicId} · с {new Date(s.user.createdAt).toLocaleDateString("ru-RU")}</p></div>
        </div>
        <p className="relative mt-8 text-[12px] font-semibold uppercase tracking-wider text-muted">Баланс</p>
        <p className="relative mt-1 font-mono text-[40px] font-semibold leading-none tabular">{points(s.balance)}</p>
        <div className="relative mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={bonus} loading={busy} disabled={!!s.bonus.availableAt}>
            {s.bonus.availableAt ? `Бонус после ${new Date(s.bonus.availableAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : `Забрать ${points(s.bonus.amount)}`}
          </Button>
          <Link href="/games"><Button variant="secondary">К играм</Button></Link>
          <Button variant="ghost" onClick={verify}>Сверить баланс</Button>
        </div>
        {msg && <p className="relative mt-3 text-[13.5px] text-soft">{msg}</p>}
        {check && <p className={`relative mt-3 text-[13.5px] ${check.ok ? "text-accent" : "text-danger"}`}>{check.ok ? `Сверка пройдена: баланс совпадает с журналом (${points(check.ledger)}).` : `Расхождение! Баланс ${points(check.balance)}, журнал ${points(check.ledger)}.`}</p>}
      </motion.section>
      <section className="grid grid-cols-2 gap-3">
        {[["Раундов", s.stats.rounds.toLocaleString("ru-RU")], ["Побед", s.stats.wins.toLocaleString("ru-RU")], ["Поставлено", points(s.stats.wagered)], ["Итог", (net > 0n ? "+" : "") + points(net)], ["Лучший множитель", Number(s.stats.bestMultiplier).toFixed(2) + "×"], ["Роль", s.user.role === "USER" ? "Игрок" : s.user.role === "ADMIN" ? "Администратор" : "Поддержка"]].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-panel p-4"><p className="text-[12px] text-muted">{k}</p><p className="mt-1 font-mono text-[19px] font-semibold tabular">{v}</p></div>
        ))}
      </section>
    </div>
  );
}
