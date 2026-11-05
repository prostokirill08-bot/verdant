import Link from "next/link";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Verdant — на главную">
      {/* Значок в новогодней шапке; градиент фоном, т.к. логотип на странице встречается дважды */}
      <span className="relative grid size-8 place-items-center rounded-[10px] bg-[linear-gradient(135deg,#ff5f6f,#b5122f)] shadow-[0_6px_18px_-6px_#e8263f]" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 32 32"><path d="M6 6.5 16 25l10-18.5" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <svg className="ny-hat absolute -right-2 -top-3 rotate-[18deg]" width="22" height="20" viewBox="0 0 24 22">
          <path d="M3 17C5 9 10 3 17 4c-1 3 0 6 2 9z" fill="#e8263f" />
          <rect x="1" y="15" width="19" height="5" rx="2.5" fill="#fff" />
          <circle cx="19.5" cy="4.5" r="3" fill="#fff" />
        </svg>
      </span>
      <span className={`font-display text-[18px] font-bold tracking-tight ${compact ? "max-[519px]:hidden" : "max-[379px]:hidden"}`}>verdant</span>
    </Link>
  );
}
