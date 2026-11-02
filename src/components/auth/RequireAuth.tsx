"use client";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";

/** Клиентская защита страниц кабинета: без входа — на /login с возвратом. Сервер всё равно проверяет доступ в API. */
export function RequireAuth({ children, role }: { children: React.ReactNode; role?: "SUPPORT" | "ADMIN" }) {
  const { user, loading } = useAuth(); const router = useRouter(); const path = usePathname();
  const rank = { USER: 0, SUPPORT: 1, ADMIN: 2 } as const;
  const denied = !!user && !!role && rank[user.role] < rank[role];
  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`); }, [loading, user, router, path]);
  if (loading || !user) return <div className="grid h-60 place-items-center"><span className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>;
  if (denied) return <p className="py-20 text-center text-muted">Недостаточно прав для этого раздела.</p>;
  return <>{children}</>;
}
