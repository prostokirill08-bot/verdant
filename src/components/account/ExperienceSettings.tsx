"use client";
import { useEffect, useState } from "react";
import { getPrefs, onPrefsChange, setPrefs, type Prefs } from "@/lib/prefs";

function Choice<T extends string>({ label, hint, value, options, onChange, testId }: { label: string; hint: string; value: T; options: [T, string][]; onChange: (v: T) => void; testId: string }) {
  return (
    <div className="grid gap-2">
      <div><p className="text-[14px] font-semibold">{label}</p><p className="text-[12.5px] text-muted">{hint}</p></div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label} data-testid={testId}>
        {options.map(([k, t]) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
            className={`rounded-xl px-3.5 py-2 text-[13.5px] font-semibold ring-1 transition-colors ${value === k ? "bg-accent text-accent-ink ring-accent" : "bg-ink text-soft ring-line hover:text-white"}`}>{t}</button>
        ))}
      </div>
    </div>
  );
}

/** Анимации и качество эффектов. Применяются сразу, сохраняются в браузере и в аккаунте. */
export function ExperienceSettings() {
  const [p, setP] = useState<Prefs>(getPrefs());
  useEffect(() => { setP(getPrefs()); return onPrefsChange(() => setP(getPrefs())); }, []);
  return (
    <div className="grid gap-5">
      <Choice label="Анимации" hint="«Минимум» убирает движение фона и покачивания, «Выкл» — все анимации интерфейса. Игры от этого только быстрее." testId="pref-animations"
        value={p.animations} options={[["on", "Все"], ["reduced", "Минимум"], ["off", "Выкл"]]} onChange={(v) => setPrefs({ animations: v })} />
      <Choice label="Качество эффектов" hint="«Экономное» отключает частицы, размытие и вспышки — для слабых телефонов и экономии батареи." testId="pref-quality"
        value={p.quality} options={[["high", "Высокое"], ["low", "Экономное"]]} onChange={(v) => setPrefs({ quality: v })} />
    </div>
  );
}
