"use client";
import { useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { getPrefs, loadPrefs, onPrefsChange, setPrefs, type Prefs } from "@/lib/prefs";
import { onSoundChange, setSound, setVolume, soundOn, soundVolume } from "@/lib/sound";
import { api } from "@/lib/api";
import { useRef } from "react";

/**
 * Применяет настройки интерфейса ко всему сайту. После входа берёт настройки из аккаунта (общие для устройств).
 * При «Анимации: выкл» framer-motion работает без движения (MotionConfig reducedMotion="always").
 */
export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [p, setP] = useState<Prefs>(getPrefs());
  useEffect(() => { setP(loadPrefs()); return onPrefsChange(() => setP(getPrefs())); }, []);
  const syncing = useRef(false);
  useEffect(() => {
    const sp = (user as { prefs?: Record<string, unknown> } | null)?.prefs;
    if (!sp) return;
    syncing.current = true;
    setP(setPrefs({ animations: sp.animations as Prefs["animations"], quality: sp.quality as Prefs["quality"] }));
    if (typeof sp.sound === "boolean" && sp.sound !== soundOn()) setSound(sp.sound);
    if (typeof sp.volume === "number" && sp.volume !== soundVolume()) setVolume(sp.volume);
    syncing.current = false;
  }, [user?.publicId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Изменения настроек и звука сохраняются в аккаунт (с задержкой, одним запросом)
  useEffect(() => {
    if (!user) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const push = () => {
      if (syncing.current) return;
      clearTimeout(t);
      t = setTimeout(() => { const cur = getPrefs(); api("/api/account/prefs", { method: "PATCH", body: { ...cur, sound: soundOn(), volume: Math.round(soundVolume() * 100) / 100 } }).catch(() => {}); }, 800);
    };
    const a = onPrefsChange(push), b = onSoundChange(push);
    return () => { a(); b(); clearTimeout(t); };
  }, [user]);
  return <MotionConfig reducedMotion={p.animations === "on" ? "user" : "always"}>{children}</MotionConfig>;
}
