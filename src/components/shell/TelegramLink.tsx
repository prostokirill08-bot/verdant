"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { launchedInTelegram } from "@/lib/telegram";

const Plane = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden><path fill="currentColor" d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13 1.4 11.5c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5Z" /></svg>
);

let cached: Promise<string | null> | null = null;
const botName = () => (cached ??= api<{ bot: string | null }>("/api/telegram/info").then((r) => r.bot).catch(() => null));

/** Ссылка «Играть в Telegram». Показывается, только когда бот подключён и мы не внутри Telegram. */
export function TelegramLink({ variant = "card" }: { variant?: "card" | "side" }) {
  const [bot, setBot] = useState<string | null>(null);
  useEffect(() => { if (!launchedInTelegram()) void botName().then(setBot); }, []);
  if (!bot) return null;
  const href = `https://t.me/${bot}?start=web`;
  if (variant === "side") return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mx-1 flex items-center gap-2 rounded-xl bg-[#229ed9]/15 px-3 py-2 text-[13.5px] font-semibold text-[#6cc7f2] hover:bg-[#229ed9]/25" data-testid="tg-link">
      <Plane className="size-4" /> Играть в Telegram
    </a>
  );
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 rounded-[24px] border border-[#229ed9]/40 bg-[linear-gradient(120deg,#0c2a44,#0f1633)] p-5 transition-colors hover:border-[#229ed9]" data-testid="tg-card">
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#229ed9] text-white shadow-[0_8px_30px_-8px_#229ed9]"><Plane className="size-8" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[18px] font-bold">Verdant в Telegram</span>
        <span className="mt-0.5 block text-[13.5px] text-white/70">Все игры прямо в мессенджере — вход в один тап, без пароля. @{bot}</span>
      </span>
      <span className="hidden shrink-0 rounded-xl bg-[#229ed9] px-4 py-2 text-[14px] font-bold text-white group-hover:brightness-110 sm:block">Открыть</span>
    </a>
  );
}
