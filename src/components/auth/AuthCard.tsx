"use client";
import { motion } from "framer-motion";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="w-full max-w-[420px] rounded-3xl border border-line bg-panel p-6 shadow-2xl sm:p-8">
        <h1 className="font-display text-[24px] font-bold">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14px] text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </motion.div>
    </div>
  );
}

export function FormError({ msg }: { msg: string }) {
  return msg ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-[13.5px] text-danger">{msg}</p> : null;
}
