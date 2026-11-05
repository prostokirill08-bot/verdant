"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard, FormError } from "@/components/auth/AuthCard";
import { useAuth } from "@/components/auth/AuthProvider";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter(); const { refresh } = useAuth();
  const [f, setF] = useState({ email: "", username: "", password: "" }); const [adult, setAdult] = useState(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const pwOk = f.password.length >= 8 && /\d/.test(f.password) && /[a-zA-Zа-яА-Я]/.test(f.password);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await api("/api/auth/register", { body: { ...f, adult } }); await refresh();
      // Пришёл из карточки игры — возвращаем прямо в игру
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/account"); router.refresh(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <AuthCard title="Регистрация" subtitle="Стартовые демо-кредиты начисляются сразу после регистрации">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field id="email" label="Email" type="email" value={f.email} onChange={set("email")} autoComplete="email" required />
        <Field id="username" label="Ник" value={f.username} onChange={set("username")} autoComplete="username" hint="3–20 символов: латиница, цифры, _" required />
        <Field id="new-password" label="Пароль" type="password" value={f.password} onChange={set("password")} autoComplete="new-password"
          hint={f.password ? (pwOk ? "Надёжный пароль" : "От 8 символов, буквы и цифры") : "От 8 символов, буквы и цифры"} required />
        <label className="flex items-start gap-3 text-[13.5px] text-soft">
          <input id="adult" type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 size-4 accent-[#e8263f]" />
          Мне есть 18 лет. Понимаю, что демо-кредиты виртуальные и не имеют денежной стоимости.
        </label>
        <FormError msg={err} />
        <Button type="submit" size="lg" loading={busy} disabled={!adult}>Создать аккаунт</Button>
        <p className="text-center text-[13.5px] text-muted">Уже есть аккаунт? <Link href="/login" className="font-semibold text-accent hover:underline">Войти</Link></p>
      </form>
    </AuthCard>
  );
}
