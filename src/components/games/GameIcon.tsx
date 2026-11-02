import type { GameSlug } from "@/lib/games";

// Собственные иконки игр (без чужих брендов): линии в 1.8 px, акцент — зелёный.
export function GameIcon({ slug, size = 22, className = "" }: { slug: GameSlug; size?: number; className?: string }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, "aria-hidden": true };
  switch (slug) {
    case "crash": return <svg {...p}><path d="M3 20h18" /><path d="M4 18c5-1 9-4 12-11" /><path d="m16 7 4-2-1 4" /></svg>;
    case "mines": return <svg {...p}><circle cx="12" cy="13" r="6" /><path d="M12 3v2M12 21v-2M3 13h2M21 13h-2M5.6 6.6l1.4 1.4M18.4 6.6 17 8" /><circle cx="10" cy="11" r="1.2" fill="currentColor" /></svg>;
    case "dice": return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="1.2" fill="currentColor" /><circle cx="15" cy="15" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>;
    case "plinko": return <svg {...p}><circle cx="12" cy="5" r="1.4" fill="currentColor" /><circle cx="8" cy="10" r="1" fill="currentColor" /><circle cx="16" cy="10" r="1" fill="currentColor" /><circle cx="5" cy="15" r="1" fill="currentColor" /><circle cx="12" cy="15" r="1" fill="currentColor" /><circle cx="19" cy="15" r="1" fill="currentColor" /><path d="M3 20h18" /></svg>;
    case "limbo": return <svg {...p}><path d="M4 19h16" /><path d="M6 19V9M12 19V5M18 19v-7" /><path d="M10 5h4" /></svg>;
    case "roulette": return <svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v5M12 15v5M4 12h5M15 12h5" /></svg>;
  }
}
