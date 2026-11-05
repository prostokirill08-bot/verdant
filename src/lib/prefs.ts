// Настройки интерфейса: анимации и качество эффектов. Хранятся в браузере и (у вошедших) в аккаунте.
export type Animations = "on" | "reduced" | "off";
export type Quality = "high" | "low";
export type Prefs = { animations: Animations; quality: Quality };
const KEY = "vd_prefs";
const DEFAULTS: Prefs = { animations: "on", quality: "high" };
const listeners = new Set<() => void>();
let current: Prefs = DEFAULTS;

const valid = (p: Partial<Prefs>): Partial<Prefs> => ({
  ...(p.animations && ["on", "reduced", "off"].includes(p.animations) ? { animations: p.animations } : {}),
  ...(p.quality && ["high", "low"].includes(p.quality) ? { quality: p.quality } : {}),
});

/** Классы на <html>: CSS по ним отключает или упрощает анимации и тяжёлые эффекты. */
function apply() {
  if (typeof document === "undefined") return;
  const c = document.documentElement.classList;
  c.toggle("anim-off", current.animations === "off");
  c.toggle("anim-reduced", current.animations === "reduced");
  c.toggle("fx-low", current.quality === "low");
}

export function loadPrefs(): Prefs {
  try { current = { ...DEFAULTS, ...valid(JSON.parse(localStorage.getItem(KEY) ?? "{}")) }; } catch { current = DEFAULTS; }
  apply(); return current;
}
export const getPrefs = () => current;
export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...valid(patch) };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* приватный режим */ }
  apply(); listeners.forEach((f) => f());
  return current;
}
export const onPrefsChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
/** Можно ли показывать «тяжёлые» эффекты (дождь частиц, вспышки). */
export const richFx = () => current.quality === "high" && current.animations === "on";
