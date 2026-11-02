import { notFound } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata = { title: "Админ-панель" };
export const dynamic = "force-dynamic";

// Доступ проверяется на сервере: без роли SUPPORT/ADMIN раздел выглядит как несуществующий
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s || s.role === "USER" || s.status === "BLOCKED") notFound();
  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-[26px] font-bold">Админ-панель</h1><p className="text-muted">Роль: {s.role === "ADMIN" ? "администратор" : "поддержка (просмотр и блокировки)"}</p></div>
      </div>
      <AdminNav role={s.role} />
      {children}
    </div>
  );
}
