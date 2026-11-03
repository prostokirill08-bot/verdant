import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Verdant — на главную">
      {/* Градиент фоном, а не внутри SVG: логотип стоит на странице дважды, и id градиента конфликтовали бы */}
      <span className="grid size-8 place-items-center rounded-[10px] bg-[linear-gradient(135deg,#8b5cf6,#ec4899_55%,#fbbf24)] shadow-[0_6px_18px_-6px_#ec4899]" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 32 32">
          <path d="M6 6.5 16 25l10-18.5" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="6.5" r="3" fill="#35f08c" />
        </svg>
      </span>
      <span className="font-display text-[18px] font-bold tracking-tight">verdant</span>
    </Link>
  );
}
