"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";

function sid(): string {
  try {
    let v = localStorage.getItem("vd_sid");
    if (!v || !/^[a-z0-9]{8,32}$/.test(v)) { v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem("vd_sid", v); }
    return v;
  } catch { return "anon" + Math.random().toString(36).slice(2, 10); }
}

/** Сколько игроков сейчас на сайте: вкладка отмечается раз в 25 с, пока открыта и видна. */
export function OnlineBadge() {
  const { user } = useAuth();
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const id = sid(); let stop = false;
    const ping = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/online", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sid: id }), credentials: "same-origin" })
        .then((r) => r.json()).then((x: { online?: number }) => { if (!stop && typeof x.online === "number") setN(x.online); }).catch(() => {});
    };
    ping();
    const t = setInterval(ping, 25_000);
    const vis = () => document.visibilityState === "visible" && ping();
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [user?.publicId]);
  if (n === null) return null;
  return (
    <span data-testid="online" title="Игроков на сайте за последнюю минуту" className="flex h-10 items-center gap-2 rounded-xl border border-line bg-panel px-2.5 sm:px-3">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-70" />
        <span className="relative inline-flex size-2.5 rounded-full bg-accent shadow-[0_0_8px_#3ee08f]" />
      </span>
      <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted sm:inline">Онлайн</span>
      <motion.span key={n} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-[15px] font-semibold tabular">{n.toLocaleString("ru-RU")}</motion.span>
    </span>
  );
}
