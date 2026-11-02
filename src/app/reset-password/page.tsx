"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard, FormError } from "@/components/auth/AuthCard";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [ok, setOk] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (pw !== pw2) return setErr("Пароли не совпадают");
    setBusy(true);
    try { await api("/api/auth/reset", { body: { token, password: pw } }); setOk(true); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  if (!token) return <AuthCard title="Ссылка неполная"><p className="text-muted">Открой ссылку из письма целиком или запроси новую.</p><Link href="/forgot-password" className="mt-4 block"><Button className="w-full">Запросить ссылку</Button></Link></AuthCard>;
  return (
    <AuthCard title="Новый пароль" subtitle="После смены пароля выйдем со всех устройств.">
      {ok ? <div className="grid gap-4"><p className="rounded-xl bg-accent/10 px-3 py-2 text-[14px] text-accent">Пароль изменён.</p><Link href="/login"><Button className="w-full">Войти</Button></Link></div> : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field id="reset-pw" label="Новый пароль" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" hint="От 8 символов, буквы и цифры" />
          <Field id="reset-pw2" label="Повтори пароль" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          <FormError msg={err} />
          <Button type="submit" size="lg" loading={busy}>Сменить пароль</Button>
        </form>
      )}
    </AuthCard>
  );
}
export default function ResetPage() { return <Suspense><ResetForm /></Suspense>; }
