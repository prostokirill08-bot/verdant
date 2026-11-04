"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Countdown } from "./Countdown";
import { weekBounds } from "@/lib/week";

type Slide = { kicker: string; title: React.ReactNode; text: string; cta: string; href: string; tint: string; countdown?: boolean };
export function HeroCarousel({ loggedIn }: { loggedIn: boolean }) {
  const weekEnd = weekBounds().end.getTime();
  const slides: Slide[] = [
    { kicker: "VERDANT · DIGITAL PLAYGROUND", title: <>Играй в своём<br/><span className="text-gradient">ритме.</span></>, text: "Открой коллекцию мини-игр, изучай механики и соревнуйся за место в таблице лидеров. Только виртуальные демо-кредиты.", cta: loggedIn ? "Открыть каталог" : "Исследовать игры", href: "/games", tint: "#39d98a" },
    { kicker: "WEEKLY CHALLENGE", title: <>Новая неделя.<br/><span className="text-gradient">Новые рекорды.</span></>, text: "Проверь себя в еженедельном рейтинге, следи за прогрессом и открывай достижения.", cta: "Смотреть рейтинг", href: "/bonuses#tournament", tint: "#8de6b2", countdown: true },
    { kicker: "YOUR GAME SPACE", title: <>Найди игру<br/><span className="text-gradient">под настроение.</span></>, text: "Быстрые раунды, классические механики и оригинальные режимы — всё в одном пространстве.", cta: "Все игры", href: "/games", tint: "#5ccf9b" },
  ];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % slides.length), 7000); return () => clearInterval(t); }, [slides.length]);
  const s = slides[i]!;
  return (
    <section className="relative isolate overflow-hidden rounded-[30px] border border-emerald-200/15 bg-[#08150e] shadow-[0_30px_90px_-45px_#1e9d62]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 -top-36 size-[440px] rounded-full border border-emerald-200/10 bg-[radial-gradient(circle_at_35%_35%,#55e99b55,transparent_58%)] blur-[1px]"/>
        <div className="absolute right-[12%] top-[12%] size-56 rotate-45 rounded-[42px] border border-emerald-100/15 bg-gradient-to-br from-emerald-200/15 via-emerald-500/5 to-transparent shadow-[0_0_90px_#31d98722] backdrop-blur-sm animate-floaty"/>
        <div className="absolute right-[20%] top-[27%] size-32 rotate-[25deg] rounded-[30px] border border-emerald-100/20 bg-gradient-to-br from-emerald-200/20 to-emerald-900/10 shadow-[0_0_70px_#35d88a33]"/>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_5%_100%,#123d28aa,transparent_55%),linear-gradient(90deg,#07110c_0%,#07110cdd_42%,transparent_100%)]"/>
        <div className="absolute inset-0 opacity-[.12] [background-image:linear-gradient(#8af0b811_1px,transparent_1px),linear-gradient(90deg,#8af0b811_1px,transparent_1px)] [background-size:42px_42px]"/>
      </div>
      <div className="relative flex min-h-[430px] flex-col justify-center p-6 sm:min-h-[460px] sm:p-11">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .3 }} className="max-w-[590px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/15 bg-emerald-200/[.07] px-3 py-1.5 text-[10px] font-bold tracking-[.2em] text-emerald-200"><span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_#5deba4]"/>{s.kicker}</span>
            <h1 className="mt-6 font-display text-[clamp(30px,5vw,54px)] font-bold leading-[1.08] tracking-[-.045em] [text-wrap:balance]">{s.title}</h1>
            <p className="mt-5 max-w-[440px] text-[14px] leading-7 text-emerald-50/65 sm:text-[15px]">{s.text}</p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link href={s.href}><Button size="lg" className="btn-shine !rounded-xl !bg-gradient-to-r !from-[#45e69b] !to-[#15945c] !px-7 !font-bold !text-[#04150c]">{s.cta}</Button></Link>
              <span className="text-[11px] font-medium tracking-wide text-emerald-100/45">21+ игровых режимов · демо</span>
            </div>
            {s.countdown && <div className="mt-6"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-emerald-100/45">До обновления недели</p><Countdown to={weekEnd} label="До конца недели" compact/></div>}
          </motion.div>
        </AnimatePresence>
        <div className="absolute bottom-6 right-6 flex gap-2 sm:bottom-8 sm:right-9">{slides.map((_,k)=><button key={k} onClick={()=>setI(k)} aria-label={`Слайд ${k+1}`} className={`h-1.5 rounded-full transition-all ${k===i?"w-8 bg-emerald-300":"w-2 bg-white/25 hover:bg-white/50"}`}/>)}</div>
      </div>
    </section>
  );
}
