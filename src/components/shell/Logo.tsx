import Link from "next/link";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-3" aria-label="Verdant — на главную">
      <span className="relative grid size-9 place-items-center rounded-xl border border-emerald-200/20 bg-[linear-gradient(145deg,#35d58b,#0b7549)] shadow-[0_8px_26px_-10px_#35d58b]">
        <svg width="23" height="23" viewBox="0 0 32 32" fill="none" aria-hidden>
          <path d="M7 7.5 16 25 25 7.5M11 15h10" stroke="#effff5" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="absolute -inset-1 rounded-[14px] border border-emerald-300/10"/>
      </span>
      <span className={`font-display text-[17px] font-bold tracking-[.12em] text-[#eafff1] ${compact ? "hidden min-[520px]:inline" : ""}`}>VERDANT</span>
    </Link>
  );
}
