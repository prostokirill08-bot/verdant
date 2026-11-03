"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import { GAME_SLUGS } from "@/lib/games";
import { haptic, loadTelegram, tg, type TgWebApp } from "@/lib/telegram";

const BG = "#070b1f";

/**
 * Работа сайта как Telegram Mini App: вход по данным Telegram, цвета шапки, системная кнопка «Назад»,
 * вибрация при выигрыше и переход в игру по ссылке t.me/бот?startapp=<игра>. Вне Telegram ничего не делает.
 */
export function TelegramBridge() {
  const router = useRouter();
  const path = usePathname();
  const { user, loading, refresh, balance } = useAuth();
  const app = useRef<TgWebApp | null>(null);
  const tried = useRef(false);

  // Запуск: SDK, оформление, вход
  useEffect(() => {
    if (loading || tried.current) return;
    tried.current = true;
    void loadTelegram().then(async (w) => {
      if (!w) return;
      app.current = w;
      try { sessionStorage.setItem("vd_tg", "1"); } catch { /* приватный режим */ }
      document.documentElement.classList.add("tg");
      w.ready(); w.expand();
      if (w.isVersionAtLeast("6.1")) { w.setHeaderColor(BG); w.setBackgroundColor(BG); }
      if (w.isVersionAtLeast("7.10")) w.setBottomBarColor?.(BG);
      if (w.isVersionAtLeast("7.7")) w.disableVerticalSwipes?.();   // свайп по игре не сворачивает окно
      // Вход: если на этом устройстве ещё нет сессии или она другого аккаунта — сервер проверит подпись и войдёт
      try {
        const r = await api<{ same?: boolean }>("/api/auth/telegram", { body: { initData: w.initData } });
        if (!r.same) await refresh();
      } catch (e) { console.warn("[telegram] вход не выполнен:", (e as Error).message); }
      const sp = w.initDataUnsafe.start_param;
      if (sp && (GAME_SLUGS as readonly string[]).includes(sp) && window.location.pathname === "/") router.replace(`/games/${sp}`);
    });
  }, [loading, refresh, router, user]);

  // Системная кнопка «Назад» вместо браузерной
  useEffect(() => {
    const w = app.current ?? tg();
    if (!w || !w.isVersionAtLeast("6.1")) return;
    const back = () => { if (window.history.length > 1) router.back(); else router.push("/"); };
    if (path === "/") { w.BackButton.hide(); return; }
    w.BackButton.show(); w.BackButton.onClick(back);
    return () => w.BackButton.offClick(back);
  }, [path, router]);

  // Вибрация, когда баланс вырос (выигрыш, бонус, приз сундука)
  const prev = useRef<bigint | null>(null);
  useEffect(() => {
    const b = BigInt(balance || "0");
    if (prev.current !== null && b > prev.current && user) haptic("win");
    prev.current = b;
  }, [balance, user]);

  return null;
}
