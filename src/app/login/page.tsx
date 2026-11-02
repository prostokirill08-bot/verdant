"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard, FormError } from "@/components/auth/AuthCard";
import { useAuth } from "@/components/auth/AuthProvider";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

function LoginForm() {
  const router = useRouter(); const sp = useSearchParams(); const { refresh } = useAuth();
  const [login, setLogin] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await api("/api/auth/login", { body: { login, password } }); await refresh();
      const next = sp.get("next"); router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/games"); router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <AuthCard title="Вход" subtitle="С возвращением в Verdant">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field id="login" label="Email или ник" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
        <Field id="password" label="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        <FormError msg={err} />
        <Button type="submit" size="lg" loading={busy}>Войти</Button>
        <div className="flex justify-between text-[13.5px]">
          <Link href="/forgot-password" className="text-muted hover:text-white">Забыли пароль?</Link>
          <Link href="/register" className="font-semibold text-accent hover:underline">Создать аккаунт</Link>
        </div>
      </form>
    </AuthCard>
  );
}
export default function LoginPage() { return <Suspense><LoginForm /></Suspense>; }
