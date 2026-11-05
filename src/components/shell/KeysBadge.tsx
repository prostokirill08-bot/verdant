"use client";
import { sfx } from "@/lib/sound";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";

/** Снежные ключи в шапке: обновляются после каждой ставки (меняется баланс), новый ключ — всплывающее сообщение. */
export function KeysBadge() {
  const { user, balance } = useAuth();
  const [keys, setKeys] = useState<{ keys: number; need: number } | null>(null);
  const [toast, setToast] = useState<number | null>(null);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      api<{ keys: number; need: number }>("/api/promo/keys").then((k) => {
        if (prev.current !== null && k.keys > prev.current) { setToast(k.keys); sfx("key"); setTimeout(() => setToast(null), 3500); }
        prev.current = k.keys; setKeys(k);
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [user, balance]);
  useEffect(() => {
    const on = () => { prev.current = null; };   // после открытия сундука ключей стало меньше — без всплывашки
    window.addEventListener("vd:keys-reset", on); return () => window.removeEventListener("vd:keys-reset", on);
  }, []);
  if (!user || !keys) return null;
  const full = keys.keys >= keys.need;
  return (
    <>
      <Link href="/bonuses#chest" title={`Снежные ключи: ${keys.keys} из ${keys.need}`} data-testid="keys-badge"
        className={`flex h-10 items-center gap-1 rounded-xl border px-2 text-[13px] font-semibold transition-colors ${full ? "animate-pulse border-gold/70 bg-gold/15 text-gold" : "border-line bg-panel text-soft hover:border-accent/50"}`}>
        <span aria-hidden>🔑</span>
        <span className="hidden gap-0.5 sm:flex">{Array.from({ length: keys.need }, (_, i) => <span key={i} className={`h-3.5 w-1.5 rounded-full ${i < keys.keys ? "bg-gold shadow-[0_0_6px_#ffd166]" : "bg-white/15"}`} />)}</span>
        <span className="font-mono sm:hidden">{keys.keys}/{keys.need}</span>
      </Link>
      <AnimatePresence>
        {toast !== null && (
          <motion.div initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} role="status"
            className="fixed left-1/2 top-20 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-gold/50 bg-panel/95 px-4 py-3 shadow-[0_20px_50px_-15px_#ffd166] backdrop-blur" data-testid="key-toast">
            <motion.span animate={{ rotate: [0, -20, 20, -10, 0] }} transition={{ duration: 0.8 }} className="text-[28px]" aria-hidden>🔑</motion.span>
            <span className="text-[14px] leading-tight"><b className="block text-gold">Снежный ключ найден!</b>{toast >= 4 ? <Link href="/bonuses#chest" className="text-accent underline">Открой сундук →</Link> : <span className="text-soft">Собрано {toast} из 4</span>}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
