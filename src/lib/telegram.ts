// Мост к Telegram Mini App (официальный SDK telegram-web-app.js грузится только внутри Telegram).
type Haptic = { impactOccurred(s: "light" | "medium" | "heavy" | "rigid" | "soft"): void; notificationOccurred(t: "error" | "success" | "warning"): void; selectionChanged(): void };
type Btn = { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
export type TgWebApp = {
  initData: string; version: string; platform: string; colorScheme: "light" | "dark";
  initDataUnsafe: { user?: { id: number; first_name: string; username?: string }; start_param?: string };
  ready(): void; expand(): void; close(): void; isVersionAtLeast(v: string): boolean;
  setHeaderColor(c: string): void; setBackgroundColor(c: string): void; setBottomBarColor?(c: string): void;
  disableVerticalSwipes?(): void; enableClosingConfirmation?(): void;
  BackButton: Btn; HapticFeedback: Haptic; openTelegramLink(url: string): void; openLink(url: string): void;
};
declare global { interface Window { Telegram?: { WebApp?: TgWebApp } } }

const SDK = "https://telegram.org/js/telegram-web-app.js?59";

/** Признаки запуска внутри Telegram: параметры в адресе или сохранённые SDK в sessionStorage. */
export function launchedInTelegram(): boolean {
  if (typeof window === "undefined") return false;
  if (/tgWebApp(Data|Platform|Version)=/.test(window.location.hash + window.location.search)) return true;
  try { return !!sessionStorage.getItem("__telegram__initParams") || sessionStorage.getItem("vd_tg") === "1"; } catch { return false; }
}

let loading: Promise<TgWebApp | null> | null = null;
/** Загружает SDK и возвращает WebApp, если страница действительно открыта из Telegram. */
export function loadTelegram(): Promise<TgWebApp | null> {
  if (!launchedInTelegram()) return Promise.resolve(null);
  loading ??= new Promise((resolve) => {
    const done = () => { const w = window.Telegram?.WebApp; resolve(w && w.initData ? w : null); };
    if (window.Telegram?.WebApp) return done();
    const s = document.createElement("script");
    s.src = SDK; s.async = true; s.onload = done; s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return loading;
}

/** Текущий WebApp, если SDK уже загружен и мы в Telegram. */
export const tg = (): TgWebApp | null => (typeof window !== "undefined" && window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null);

/** Лёгкая вибрация в Telegram (на сайте ничего не делает). */
export function haptic(kind: "tap" | "win" | "lose" | "select" = "tap") {
  const w = tg(); if (!w || !w.isVersionAtLeast("6.1")) return;
  try {
    if (kind === "tap") w.HapticFeedback.impactOccurred("light");
    else if (kind === "select") w.HapticFeedback.selectionChanged();
    else w.HapticFeedback.notificationOccurred(kind === "win" ? "success" : "error");
  } catch { /* старые клиенты */ }
}
