"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar, AVATARS, type AvatarKey } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { isGuestEmail, isTelegramEmail } from "@/lib/guest";
import { useRouter } from "next/navigation";
import { SoundSettings } from "@/components/ui/SoundToggle";

type Sess = { current: boolean; userAgent: string | null; createdAt: string };

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-line bg-panel p-6"><h2 className="font-display text-[18px] font-bold">{title}</h2><div className="mt-5">{children}</div></section>;
}

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [username, setUsername] = useState(user?.username ?? ""); const [pMsg, setPMsg] = useState(""); const [pBusy, setPBusy] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" }); const [pwMsg, setPwMsg] = useState(""); const [pwBusy, setPwBusy] = useState(false);
  const [sessions, setSessions] = useState<Sess[]>([]); const [sMsg, setSMsg] = useState("");
  const router = useRouter();
  const [hidden, setHidden] = useState(!!user?.hidden);
  useEffect(() => { setHidden(!!user?.hidden); }, [user?.hidden]);
  const [del, setDel] = useState({ open: false, confirm: "", password: "", busy: false, msg: "" });
  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault(); setDel((d) => ({ ...d, busy: true, msg: "" }));
    try { await api("/api/account/delete", { body: { confirm: del.confirm, password: del.password || undefined } }); await refresh(); router.push("/"); }
    catch (er) { setDel((d) => ({ ...d, busy: false, msg: (er as Error).message })); }
  }
  const loadSessions = () => api<{ sessions: Sess[] }>("/api/account/sessions").then((r) => setSessions(r.sessions)).catch(() => {});
  useEffect(() => { void loadSessions(); }, []);

  async function saveProfile(patch: { username?: string; avatar?: string; hidden?: boolean }) {
    setPBusy(true); setPMsg("");
    try { await api("/api/account/profile", { method: "PATCH", body: patch }); await refresh(); setPMsg("Сохранено"); }
    catch (e) { setPMsg((e as Error).message); } finally { setPBusy(false); }
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setPwBusy(true); setPwMsg("");
    try { await api("/api/account/password", { body: pw }); setPw({ current: "", next: "" }); setPwMsg("Пароль изменён. Другие устройства вышли из аккаунта."); await loadSessions(); }
    catch (e) { setPwMsg((e as Error).message); } finally { setPwBusy(false); }
  }
  async function revoke() {
    try { const r = await api<{ revoked: number }>("/api/account/sessions", { method: "DELETE" }); setSMsg(r.revoked ? `Завершено сеансов: ${r.revoked}` : "Других активных сеансов нет"); await loadSessions(); }
    catch (e) { setSMsg((e as Error).message); }
  }
  if (!user) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Профиль">
        <p className="text-[12px] font-medium uppercase tracking-wider text-muted">Аватар</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(AVATARS) as AvatarKey[]).map((k) => (
            <button key={k} onClick={() => saveProfile({ avatar: k })} aria-label={`Аватар ${k}`} aria-pressed={user.avatar === k}
              className={`rounded-full p-0.5 ring-2 transition ${user.avatar === k ? "ring-accent" : "ring-transparent hover:ring-line"}`}><Avatar name={user.username} avatar={k} size={44} /></button>
          ))}
        </div>
        <form className="mt-5 grid gap-3" onSubmit={(e) => { e.preventDefault(); void saveProfile({ username }); }}>
          <Field id="set-username" label="Ник" value={username} onChange={(e) => setUsername(e.target.value)} hint="3–20 символов: латиница, цифры, _" />
          <div className="flex items-center gap-3"><Button type="submit" loading={pBusy} disabled={username === user.username}>Сохранить ник</Button>{pMsg && <span className="text-[13.5px] text-soft">{pMsg}</span>}</div>
        </form>
        <dl className="mt-6 grid gap-2 border-t border-line pt-4 text-[14px]">
          <div className="flex justify-between"><dt className="text-muted">ID игрока</dt><dd className="font-mono">{user.publicId}</dd></div>
          {isTelegramEmail(user.email)
            ? <div className="flex justify-between"><dt className="text-muted">Вход</dt><dd>через Telegram</dd></div>
            : <div className="flex justify-between"><dt className="text-muted">Email</dt><dd>{user.email}</dd></div>}
        </dl>
      </Panel>
      {!isTelegramEmail(user.email) && !isGuestEmail(user.email) && <Panel title="Пароль">
        <form className="grid gap-3" onSubmit={changePw}>
          <Field id="pw-current" label="Текущий пароль" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <Field id="pw-next" label="Новый пароль" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} hint="От 8 символов, буквы и цифры" />
          <div className="flex items-center gap-3"><Button type="submit" loading={pwBusy} disabled={!pw.current || !pw.next}>Сменить пароль</Button></div>
          {pwMsg && <p className="text-[13.5px] text-soft">{pwMsg}</p>}
        </form>
      </Panel>}
      <Panel title="Звук"><SoundSettings /></Panel>
      <Panel title="Приватность">
        <label className="flex cursor-pointer items-start justify-between gap-4" data-testid="privacy-hidden">
          <span><span className="block font-semibold">Анонимный режим</span><span className="mt-1 block text-[13.5px] text-muted">В ленте выигрышей, таблице турнира и ставках Crash вместо ника показывается «Скрытый игрок». Играть и получать призы это не мешает.</span></span>
          <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[#3ee08f]" checked={hidden} onChange={(e) => { setHidden(e.target.checked); void saveProfile({ hidden: e.target.checked }); }} />
        </label>
        <ul className="mt-5 grid gap-1.5 border-t border-line pt-4 text-[13.5px] text-muted">
          <li>🔒 Мы не храним IP-адреса — только обезличенную метку для защиты от взлома.</li>
          <li>🔒 Почта и Telegram никогда не показываются другим игрокам.</li>
          <li>🔒 Нет сторонних счётчиков, рекламы и трекеров.</li>
        </ul>
      </Panel>
      <Panel title="Активные сеансы">
        <ul className="grid gap-2">
          {sessions.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-ink px-3 py-2.5 text-[13.5px]">
              <span className="min-w-0"><span className="block truncate">{s.userAgent?.replace(/\(.*?\)/g, "").slice(0, 60) || "Неизвестное устройство"}</span><span className="text-muted">{new Date(s.createdAt).toLocaleString("ru-RU")}</span></span>
              {s.current && <span className="shrink-0 rounded-md bg-accent/15 px-2 py-0.5 text-[12px] font-semibold text-accent">Это устройство</span>}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center gap-3"><Button variant="danger" onClick={revoke}>Выйти на других устройствах</Button>{sMsg && <span className="text-[13.5px] text-soft">{sMsg}</span>}</div>
      </Panel>
      {user.role === "USER" && <Panel title="Удаление аккаунта">
        <p className="text-[14px] text-muted">Аккаунт, баланс, история игр, пополнения и призы будут удалены навсегда. Восстановить их будет нельзя.</p>
        {!del.open ? <Button variant="danger" className="mt-4" onClick={() => setDel((d) => ({ ...d, open: true }))}>Удалить аккаунт</Button> : (
          <form className="mt-4 grid gap-3" onSubmit={deleteAccount} data-testid="delete-form">
            <Field id="del-confirm" label={`Введи ник «${user.username}» для подтверждения`} value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} />
            {!isGuestEmail(user.email) && !isTelegramEmail(user.email) && <Field id="del-pw" label="Пароль" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />}
            {del.msg && <p className="text-[13.5px] text-danger">{del.msg}</p>}
            <div className="flex gap-2"><Button type="submit" variant="danger" loading={del.busy} disabled={del.confirm !== user.username}>Удалить навсегда</Button><Button type="button" variant="ghost" onClick={() => setDel({ open: false, confirm: "", password: "", busy: false, msg: "" })}>Отмена</Button></div>
          </form>
        )}
      </Panel>}
    </div>
  );
}
