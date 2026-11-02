"use client";
import Link from "next/link";
import { useState } from "react";
import { AuthCard, FormError } from "@/components/auth/AuthCard";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

export default function ForgotPage() {
  const [email, setEmail] = useState(""); const [done, setDone] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const r = await api<{ message: string }>("/api/auth/forgot", { body: { email } }); setDone(r.message); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <AuthCard title="Восстановление пароля" subtitle="Пришлём ссылку для смены пароля. Она действует 30 минут.">
      {done ? <div className="grid gap-4"><p className="rounded-xl bg-accent/10 px-3 py-2 text-[14px] text-accent">{done}</p><Link href="/login"><Button variant="secondary" className="w-full">Вернуться ко входу</Button></Link></div> : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="forgot-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <FormError msg={err} />
          <Button type="submit" size="lg" loading={busy}>Отправить ссылку</Button>
          <Link href="/login" className="text-center text-[13.5px] text-muted hover:text-white">Вспомнил пароль</Link>
        </form>
      )}
    </AuthCard>
  );
}
