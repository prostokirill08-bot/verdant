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
    case "atlas": return <svg {...p}><path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h9" /><path d="m11 6 .9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" /></svg>;
    case "neon-garden": return <svg {...p}><circle cx="8" cy="16" r="3.5" /><circle cx="16" cy="17" r="3" /><path d="M8 12.5C9 8 12 6 15 5M16 14c0-4-1-7-1-9" /></svg>;
    case "tower": return <svg {...p}><path d="M7 21V8l5-5 5 5v13zM10 21v-4h4v4M10 11h4" /></svg>;
    case "hilo": return <svg {...p}><rect x="5" y="3" width="11" height="15" rx="2" /><path d="M19 8l2 2-2 2M19 16l2-2" /></svg>;
    case "wheel": return <svg {...p}><circle cx="12" cy="13" r="8" /><path d="M12 5v16M4 13h16M6.3 7.3l11.4 11.4M17.7 7.3 6.3 18.7" /><path d="M10 2h4l-2 3z" /></svg>;
    case "keno": return <svg {...p}><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><circle cx="8" cy="16" r="3" /><circle cx="16" cy="16" r="3" /></svg>;
    case "coinflip": return <svg {...p}><ellipse cx="12" cy="12" rx="8" ry="8" /><path d="m12 8 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" /></svg>;
    case "blackjack": return <svg {...p}><rect x="3" y="5" width="11" height="15" rx="2" /><path d="M10 4.5 11 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M8.5 9.5 7 14h3" /></svg>;
    case "videopoker": return <svg {...p}><rect x="2" y="6" width="5" height="8" rx="1" /><rect x="9.5" y="6" width="5" height="8" rx="1" /><rect x="17" y="6" width="5" height="8" rx="1" /><path d="M4 18h16" /></svg>;
    case "baccarat": return <svg {...p}><rect x="3" y="4" width="8" height="12" rx="1.5" /><rect x="13" y="8" width="8" height="12" rx="1.5" /><path d="M7 8v4M17 12v4" /></svg>;
    case "sledrace": return <svg {...p}><path d="M3 15h15a3 3 0 0 0 3-3" /><path d="M6 15v-3h9v3M8 12V9h5v3" /><path d="M3 19h17" /></svg>;
    case "roulette": return <svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v5M12 15v5M4 12h5M15 12h5" /></svg>;
  }
}
