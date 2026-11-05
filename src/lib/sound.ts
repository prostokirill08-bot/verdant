"use client";
/**
 * Звуки сайта. Всё синтезируется в браузере через Web Audio API — без звуковых файлов:
 * сайт не тяжелеет, нет чужих сэмплов и лицензий. Браузер разрешает звук только после первого
 * касания/клика, поэтому контекст создаётся и «будится» при первом действии пользователя.
 *
 * Использование: sfx("spin"), sfx("reel", { i: 2 }), winSfx(multiplier).
 * Выключатель и громкость хранятся в localStorage (vd_sound / vd_volume).
 */

export type Sfx =
  | "tap" | "bet" | "chip" | "spin" | "reel" | "tick" | "win" | "bigwin" | "megawin" | "lose" | "bonus" | "coin" | "coins"
  | "card" | "flip" | "gem" | "boom" | "cashout" | "key" | "chest" | "jackpot" | "dice" | "pop" | "bells" | "whoosh" | "count" | "launch"
  // темы новых слотов: «Лавина», «Салют», «Хрустальный шар»
  | "ice" | "rumble" | "chime" | "drop" | "whistle" | "firework" | "glass" | "harp" | "upgrade";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const last = new Map<string, number>();

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
let enabled = typeof window !== "undefined" ? read("vd_sound", "1") === "1" : true;
let volume = typeof window !== "undefined" ? Number(read("vd_volume", "0.6")) : 0.6;
const listeners = new Set<() => void>();

export const soundOn = () => enabled;
export const soundVolume = () => volume;
export function setSound(on: boolean) {
  enabled = on; try { localStorage.setItem("vd_sound", on ? "1" : "0"); } catch { /* приватный режим */ }
  if (on) { unlock(); sfx("tap"); }
  listeners.forEach((f) => f());
}
export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v)); try { localStorage.setItem("vd_volume", String(volume)); } catch { /* */ }
  if (master && ctx) master.gain.setTargetAtTime(volume * 0.5, ctx.currentTime, 0.02);
  listeners.forEach((f) => f());
}
export const onSoundChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

function unlock() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = volume * 0.5;
    // Мягкий компрессор: громкие выигрыши не «бьют» по ушам, тихие тики слышны
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}
if (typeof window !== "undefined") {
  const wake = () => unlock();
  window.addEventListener("pointerdown", wake, { passive: true });
  window.addEventListener("keydown", wake);
}

// ---------- примитивы ----------
type ToneOpts = { f: number; to?: number; t?: number; d: number; type?: OscillatorType; g?: number; a?: number; pan?: number };
function tone({ f, to, t = 0, d, type = "sine", g = 0.3, a = 0.005, pan = 0 }: ToneOpts) {
  const c = ctx!; const s = c.currentTime + t;
  const o = c.createOscillator(); const v = c.createGain(); const p = c.createStereoPanner();
  o.type = type; o.frequency.setValueAtTime(f, s); if (to) o.frequency.exponentialRampToValueAtTime(to, s + d);
  v.gain.setValueAtTime(0.0001, s); v.gain.exponentialRampToValueAtTime(g, s + a); v.gain.exponentialRampToValueAtTime(0.0001, s + d);
  p.pan.value = pan; o.connect(v).connect(p).connect(master!); o.start(s); o.stop(s + d + 0.05);
}
function noise({ t = 0, d, g = 0.3, f = 1000, q = 1, type = "bandpass", to }: { t?: number; d: number; g?: number; f?: number; q?: number; type?: BiquadFilterType; to?: number }) {
  const c = ctx!; const s = c.currentTime + t;
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, s); fl.Q.value = q; if (to) fl.frequency.exponentialRampToValueAtTime(to, s + d);
  const v = c.createGain(); v.gain.setValueAtTime(0.0001, s); v.gain.exponentialRampToValueAtTime(g, s + 0.004); v.gain.exponentialRampToValueAtTime(0.0001, s + d);
  src.connect(fl).connect(v).connect(master!); src.start(s, Math.random() * 0.5); src.stop(s + d + 0.05);
}
/** Колокольчик: основной тон + неровные обертоны (звучит «празднично», как ёлочный колокольчик). */
function bell(f: number, t = 0, g = 0.22, d = 0.9) {
  tone({ f, t, d, g, type: "sine" }); tone({ f: f * 2.76, t, d: d * 0.5, g: g * 0.35 }); tone({ f: f * 5.4, t, d: d * 0.25, g: g * 0.15 });
}
const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI → Гц
const arp = (notes: number[], step: number, g = 0.2, d = 0.5, t0 = 0) => notes.forEach((n, i) => bell(NOTE(n), t0 + i * step, g, d));

// ---------- звуки ----------
const RECIPES: Record<Sfx, (o: { i?: number; pitch?: number }) => void> = {
  tap: () => tone({ f: 1400, d: 0.05, g: 0.08, type: "triangle" }),
  bet: () => { noise({ d: 0.05, f: 3200, q: 4, g: 0.25 }); noise({ t: 0.045, d: 0.06, f: 2400, q: 4, g: 0.2 }); },
  chip: () => { noise({ d: 0.04, f: 4200, q: 6, g: 0.22 }); tone({ f: 2100, d: 0.06, g: 0.05, type: "triangle" }); },
  spin: () => { noise({ d: 0.5, f: 400, to: 2400, q: 1.2, g: 0.12 }); tone({ f: 180, to: 420, d: 0.35, g: 0.06, type: "triangle" }); },
  reel: ({ i = 0 }) => { tone({ f: 110 + i * 6, to: 70, d: 0.14, g: 0.32, type: "sine", pan: -0.6 + i * 0.3 }); noise({ d: 0.05, f: 1800, q: 2, g: 0.12 }); },
  tick: ({ pitch = 1 }) => tone({ f: 2200 * pitch, d: 0.03, g: 0.07, type: "square" }),
  count: ({ pitch = 1 }) => tone({ f: 1500 * pitch, d: 0.04, g: 0.05, type: "triangle" }),
  win: () => arp([76, 79, 84], 0.07, 0.18, 0.45),
  bigwin: () => { arp([72, 76, 79, 84, 88], 0.08, 0.2, 0.7); tone({ f: NOTE(48), d: 0.9, g: 0.12, type: "triangle", t: 0.3 }); },
  megawin: () => {
    arp([72, 76, 79, 84, 79, 84, 88, 91], 0.09, 0.2, 0.7);
    [60, 64, 67].forEach((n) => tone({ f: NOTE(n), t: 0.75, d: 1.4, g: 0.09, type: "triangle" }));
    for (let k = 0; k < 10; k++) bell(NOTE(96 + (k % 5)), 0.8 + k * 0.07, 0.06, 0.4);
  },
  lose: () => { tone({ f: 330, to: 250, d: 0.22, g: 0.08, type: "triangle" }); tone({ f: 247, to: 180, t: 0.12, d: 0.3, g: 0.07, type: "triangle" }); },
  bonus: () => {
    noise({ d: 1.2, f: 600, to: 6000, q: 0.8, g: 0.08 });
    for (let k = 0; k < 12; k++) bell(NOTE(72 + k * 2), k * 0.06, 0.12, 0.5);
    arp([84, 88, 91, 96], 0.12, 0.2, 0.9, 0.75);
  },
  coin: ({ pitch = 1 }) => { tone({ f: 1975 * pitch, d: 0.12, g: 0.15 }); tone({ f: 2637 * pitch, t: 0.06, d: 0.3, g: 0.15 }); },
  coins: () => {},   // задаётся ниже: монеты звенят по очереди
  card: () => noise({ d: 0.09, f: 3000, to: 1200, q: 0.9, g: 0.22, type: "bandpass" }),
  flip: () => { noise({ d: 0.05, f: 2500, q: 1, g: 0.15 }); tone({ f: 600, to: 900, d: 0.06, g: 0.05, type: "triangle" }); },
  gem: ({ pitch = 1 }) => bell(1046 * pitch, 0, 0.18, 0.5),
  boom: () => { noise({ d: 0.7, f: 900, to: 80, q: 0.7, g: 0.5, type: "lowpass" }); tone({ f: 120, to: 35, d: 0.6, g: 0.4 }); },
  cashout: () => { arp([79, 84, 88], 0.05, 0.18, 0.4); noise({ t: 0.15, d: 0.08, f: 5000, q: 3, g: 0.1 }); },
  key: () => { for (let k = 0; k < 6; k++) bell(NOTE(88 + [0, 4, 7, 12, 7, 12][k]!), k * 0.05, 0.1, 0.4); },
  chest: () => { tone({ f: 90, to: 140, d: 0.35, g: 0.15, type: "sawtooth" }); noise({ d: 0.3, f: 500, q: 3, g: 0.12 }); arp([72, 79, 84, 88], 0.09, 0.2, 0.8, 0.35); },
  jackpot: () => { RECIPES.megawin({}); for (let k = 0; k < 16; k++) RECIPES.coin({ pitch: 0.8 + Math.random() * 0.5 }); },
  dice: () => { for (let k = 0; k < 5; k++) noise({ t: k * 0.045 + Math.random() * 0.02, d: 0.04, f: 1800 + Math.random() * 1500, q: 3, g: 0.18 }); },
  pop: ({ pitch = 1 }) => tone({ f: 600 * pitch, to: 1200 * pitch, d: 0.08, g: 0.12, type: "sine" }),
  bells: () => { for (let k = 0; k < 8; k++) { noise({ t: k * 0.11, d: 0.08, f: 7000, q: 8, g: 0.08 }); bell(NOTE(93 + (k % 2) * 2), k * 0.11, 0.04, 0.2); } },
  whoosh: () => noise({ d: 0.35, f: 300, to: 3000, q: 0.7, g: 0.12 }),
  // Лёд раскалывается: короткий хруст + россыпь высоких «осколков»
  ice: () => { noise({ d: 0.12, f: 5200, q: 1.5, g: 0.22, type: "highpass" }); for (let k = 0; k < 5; k++) tone({ f: 2600 + Math.random() * 3200, t: 0.02 + k * 0.025, d: 0.18, g: 0.05 }); },
  // Гул лавины: низкий шум нарастает и стихает
  rumble: () => { noise({ d: 1.6, f: 160, to: 60, q: 0.8, g: 0.35, type: "lowpass" }); tone({ f: 55, to: 38, d: 1.4, g: 0.18, type: "triangle" }); },
  // Множитель растёт: ледяной перезвон, чем выше pitch — тем выше нота
  chime: ({ pitch = 1 }) => { bell(1318 * pitch, 0, 0.16, 0.7); bell(1975 * pitch, 0.06, 0.1, 0.6); },
  drop: ({ i = 0 }) => tone({ f: 260 - i * 18, to: 140, d: 0.09, g: 0.12, type: "sine", pan: -0.7 + i * 0.28 }),
  // Ракета: свист вверх
  whistle: () => { tone({ f: 700, to: 2600, d: 0.55, g: 0.07, type: "sine" }); noise({ d: 0.5, f: 2000, to: 5000, q: 6, g: 0.05 }); },
  // Салют: хлопок и треск искр
  firework: () => {
    tone({ f: 140, to: 40, d: 0.4, g: 0.35 }); noise({ d: 0.35, f: 1200, to: 200, q: 0.7, g: 0.3, type: "lowpass" });
    for (let k = 0; k < 14; k++) noise({ t: 0.15 + Math.random() * 0.6, d: 0.03, f: 3000 + Math.random() * 4000, q: 4, g: 0.08 });
  },
  // Стекло хрустального шара
  glass: ({ pitch = 1 }) => { tone({ f: 2093 * pitch, d: 0.6, g: 0.1 }); tone({ f: 3136 * pitch, d: 0.4, g: 0.06 }); tone({ f: 4699 * pitch, d: 0.25, g: 0.03 }); },
  // Арфа: быстрый глиссандо вверх (раскрытие шаров)
  harp: () => { [60, 64, 67, 71, 72, 76, 79, 83, 84].forEach((n, k) => tone({ f: NOTE(n + 12), t: k * 0.035, d: 0.5, g: 0.07, type: "triangle" })); },
  // Улучшение символа в бонусе
  upgrade: ({ pitch = 1 }) => { tone({ f: 523 * pitch, to: 1046 * pitch, d: 0.25, g: 0.1, type: "triangle" }); bell(1568 * pitch, 0.2, 0.14, 0.6); },
  launch: () => { noise({ d: 0.8, f: 200, to: 1500, q: 0.6, g: 0.15, type: "lowpass" }); tone({ f: 80, to: 220, d: 0.8, g: 0.12, type: "sawtooth" }); },
};
RECIPES.coins = () => { for (let k = 0; k < 7; k++) setTimeout(() => RECIPES.coin({ pitch: 0.9 + Math.random() * 0.3 }), k * 55); };

/** Минимальный интервал между одинаковыми звуками, мс (чтобы тики не сливались в шум). */
const GAP: Partial<Record<Sfx, number>> = { tick: 35, count: 45, card: 40, chip: 30, pop: 30, coin: 25, gem: 40, reel: 20, ice: 40, drop: 15, glass: 40 };

export function sfx(name: Sfx, o: { i?: number; pitch?: number; delay?: number } = {}) {
  if (!enabled || typeof window === "undefined") return;
  if (o.delay) { setTimeout(() => sfx(name, { ...o, delay: 0 }), o.delay); return; }
  const c = unlock(); if (!c || c.state !== "running") return;
  const now = performance.now(); const gap = GAP[name] ?? 0;
  if (gap && now - (last.get(name) ?? 0) < gap) return;
  last.set(name, now);
  try { RECIPES[name](o); } catch { /* звук не должен ломать игру */ }
}

/** Звук результата по множителю: проигрыш / выигрыш / большой / мега. */
export function winSfx(mult: number, delay = 0) {
  const n: Sfx = mult <= 0 ? "lose" : mult < 1 ? "coin" : mult < 5 ? "win" : mult < 20 ? "bigwin" : "megawin";
  sfx(n, { delay });
}

/**
 * Тики замедляющегося вращения (колесо, рулетка): n тиков за durMs, всё реже к концу —
 * как у настоящего колеса с язычком. Возвращает функцию отмены.
 */
export function spinTicks(n: number, durMs: number, pitch = 1): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (let k = 1; k <= n; k++) {
    const s = k / n; const t = 1 - Math.cbrt(1 - s);          // обратная к easeOut-кубической
    timers.push(setTimeout(() => sfx("tick", { pitch: pitch * (1.15 - s * 0.3) }), t * durMs));
  }
  return () => timers.forEach(clearTimeout);
}
