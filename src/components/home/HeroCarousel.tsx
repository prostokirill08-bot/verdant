"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

type Slide = { img: string; kicker: string; title: React.ReactNode; text: string; cta: string; href: string; tint: string };

export function HeroCarousel({ loggedIn }: { loggedIn: boolean }) {
  const slides: Slide[] = [
    { img: "/img/banners/main.webp", kicker: "Демо-режим · виртуальные баллы", title: <>Играй без риска.<br /><span className="text-gradient">1 000 баллов</span> на старт</>, text: "Слоты, Crash, Mines, Plinko и другие игры. Баллы нельзя купить или вывести — только азарт и честные результаты.", cta: loggedIn ? "К играм" : "Забрать 1 000 баллов", href: loggedIn ? "/games" : "/register", tint: "#8b5cf6" },
    { img: "/img/banners/slots.webp", kicker: "Новинки", title: <>Новые слоты:<br /><span className="text-gradient">Атлас звёзд</span> и Неоновый сад</>, text: "Три символа BONUS — и бесплатные вращения: раскрывающийся символ в «Атласе» и выигрыши ×3 в «Саду».", cta: "Крутить слоты", href: "/games?cat=slots", tint: "#ec4899" },
    { img: "/img/banners/crash.webp", kicker: "Хит · реальное время", title: <>Crash: ракета летит.<br /><span className="text-gradient">Успей забрать</span></>, text: "Общий раунд для всех игроков. Множитель растёт, пока ракета не взорвётся.", cta: "Запустить ракету", href: "/games/crash", tint: "#22d3ee" },
  ];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % slides.length), 6500); return () => clearInterval(t); }, [slides.length]);
  const s = slides[i]!;
  return (
    <section className="relative overflow-hidden rounded-[28px] ring-1 ring-white/10" style={{ boxShadow: `0 30px 80px -40px ${s.tint}` }}>
      <div className="relative min-h-[380px] sm:min-h-[400px]">
        <AnimatePresence mode="popLayout">
          <motion.div key={s.img} initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }} className="absolute inset-0">
            <Image src={s.img} alt="" fill priority sizes="(max-width: 1024px) 100vw, 1000px" className="object-cover object-[70%_center]" />
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-transparent sm:via-ink/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent sm:hidden" />
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.35 }} className="relative flex min-h-[380px] max-w-xl flex-col justify-end gap-4 p-6 sm:min-h-[400px] sm:justify-center sm:p-10">
            <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/90 backdrop-blur">{s.kicker}</span>
            <h1 className="font-display text-[clamp(26px,4.4vw,46px)] font-bold leading-[1.05] tracking-tight [text-wrap:balance]">{s.title}</h1>
            <p className="max-w-md text-[15px] leading-relaxed text-white/80">{s.text}</p>
            <Link href={s.href} className="w-fit"><Button size="lg" className="btn-shine px-7">{s.cta}</Button></Link>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="absolute bottom-4 right-5 flex gap-1.5">
        {slides.map((_, k) => <button key={k} onClick={() => setI(k)} aria-label={`Слайд ${k + 1}`} className={`h-2 rounded-full transition-all ${k === i ? "w-7 bg-white" : "w-2 bg-white/40 hover:bg-white/70"}`} />)}
      </div>
    </section>
  );
}
