"use client";
import { ACH_ICONS } from "@/lib/progress";

/** Иконка достижения: неоновый значок в круге; серый, пока не получено. */
export function AchIcon({ icon, done, size = 48 }: { icon: string; done: boolean; size?: number }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-2xl ring-1 ${done ? "bg-[radial-gradient(circle_at_35%_30%,#2a5a33,#0b1a10)] text-accent ring-accent/50 shadow-[0_0_22px_-8px_#8bea4e]" : "bg-[#0b130e] text-white/30 ring-white/10"}`} style={{ width: size, height: size }} aria-hidden>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"><path d={ACH_ICONS[icon] ?? ACH_ICONS.star} /></svg>
    </span>
  );
}

/** Полоска прогресса с подписью «x / y». */
export function ProgressBar({ value, target, done }: { value: number; target: number; done?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, target)) * 100));
  return (
    <div className="grid gap-1">
      <div className="h-2 overflow-hidden rounded-full bg-white/[.06]" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={value}>
        <div className={`h-full rounded-full transition-[width] duration-500 ${done ? "bg-[linear-gradient(90deg,#35c46e,#a7f66b)]" : "bg-[linear-gradient(90deg,#1f6b3a,#5fb84a)]"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="font-mono text-[11.5px] text-muted tabular">{Number.isInteger(value) ? value.toLocaleString("ru-RU") : value.toFixed(2)} / {target.toLocaleString("ru-RU")}</p>
    </div>
  );
}

export function Panel({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-line bg-panel p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-display text-[17px] font-bold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}
