import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Verdant — на главную">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#00c47a" />
        <path d="M8 9.5 16 24l8-14.5" fill="none" stroke="#04150d" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="9.5" r="2.2" fill="#04150d" />
      </svg>
      <span className="font-display text-[17px] font-bold tracking-tight">verdant</span>
    </Link>
  );
}
