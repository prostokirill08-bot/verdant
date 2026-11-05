"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Me = { publicId: string; username: string; email: string; role: "USER" | "SUPPORT" | "ADMIN"; avatar: string; hidden?: boolean; prefs?: Record<string, unknown> };
type Ctx = { user: Me | null; balance: string; loading: boolean; refresh: () => Promise<void>; setBalance: (b: string) => void };

const AuthCtx = createContext<Ctx>({ user: null, balance: "0", loading: true, refresh: async () => {}, setBalance: () => {} });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [balance, setBalance] = useState("0");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { const r = await api<{ user: Me | null; balance?: string }>("/api/auth/me"); setUser(r.user); setBalance(r.balance ?? "0"); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <AuthCtx.Provider value={{ user, balance, loading, refresh, setBalance }}>{children}</AuthCtx.Provider>;
}
