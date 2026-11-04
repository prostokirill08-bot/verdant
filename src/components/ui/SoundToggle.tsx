"use client";
import { useEffect, useState } from "react";
import { onSoundChange, setSound, setVolume, soundOn, soundVolume } from "@/lib/sound";

/** Состояние звука, общее для всех кнопок на странице. */
export function useSound() {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);   // до гидрации показываем «вкл» одинаково с сервером
  useEffect(() => { setReady(true); return onSoundChange(() => force((x) => x + 1)); }, []);
  return { on: ready ? soundOn() : true, volume: ready ? soundVolume() : 0.6 };
}

const Icon = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
    {on ? <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></> : <path d="m16 9 6 6m0-6-6 6" />}
  </svg>
);

/** Круглая кнопка вкл/выкл звука (на игровом поле). */
export function SoundToggle({ className = "", testId = "sound-toggle" }: { className?: string; testId?: string }) {
  const { on } = useSound();
  return (
    <button type="button" onClick={() => setSound(!on)} aria-pressed={on} aria-label={on ? "Выключить звук" : "Включить звук"} title={on ? "Звук включён" : "Звук выключен"} data-testid={testId}
      className={`grid size-9 place-items-center rounded-full bg-black/45 text-white/85 ring-1 ring-white/15 backdrop-blur transition hover:bg-black/60 hover:text-white ${on ? "" : "text-white/50"} ${className}`}>
      <Icon on={on} />
    </button>
  );
}

/** Кнопка-«плашка» в шапке игры, рядом с «Честностью». */
export function SoundChip() {
  const { on } = useSound();
  return (
    <button type="button" onClick={() => setSound(!on)} aria-pressed={on} data-testid="sound-toggle"
      className={`flex items-center gap-1.5 rounded-lg bg-panel/80 px-2.5 py-1.5 ring-1 ring-line hover:ring-accent/50 ${on ? "text-soft" : "text-muted"}`}>
      <Icon on={on} />{on ? "Звук" : "Звук выкл."}
    </button>
  );
}

/** Панель для настроек: выключатель и громкость. */
export function SoundSettings() {
  const { on, volume } = useSound();
  return (
    <div className="grid gap-4">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span><span className="block font-semibold">Звуковые эффекты</span><span className="mt-1 block text-[13.5px] text-muted">Прокрутка барабанов, выигрыши, бонусы, карты, ключи и сундуки.</span></span>
        <input type="checkbox" className="size-5 shrink-0 accent-[#3ee08f]" checked={on} onChange={(e) => setSound(e.target.checked)} data-testid="sound-switch" />
      </label>
      <label className={`grid gap-2 ${on ? "" : "opacity-50"}`}>
        <span className="flex justify-between text-[13px] text-muted"><span>Громкость</span><span className="font-mono">{Math.round(volume * 100)}%</span></span>
        <input type="range" min={0} max={100} value={Math.round(volume * 100)} disabled={!on} onChange={(e) => setVolume(Number(e.target.value) / 100)} className="w-full accent-[#3ee08f]" aria-label="Громкость" />
      </label>
    </div>
  );
}

export { Icon as SoundIcon };
