"use client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/play/kit";
import { Loading, tdCls, thCls, useAdminData } from "@/components/admin/ui";
import { points, timeAgo } from "@/lib/format";

type Sum = { sum: string; count: number };
type R = { day: Sum; week: Sum; all: Sum; payers: number; items: { id: string; amount: string; method: string; createdAt: string; user: { id: string; username: string; publicId: string } }[] };
const METHOD: Record<string, string> = { card: "Карта", sbp: "СБП", wallet: "Кошелёк" };

export default function AdminDeposits() {
  const { data, error, reload } = useAdminData<R>("/api/admin/deposits");
  if (!data) return <Loading error={error} />;
  const avg = data.all.count ? BigInt(data.all.sum) / BigInt(data.all.count) : 0n;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["За 24 часа", data.day], ["За 7 дней", data.week], ["Всего", data.all]].map(([t, s]) => (
          <div key={t as string} className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-[12px] uppercase tracking-wider text-muted">{t as string}</p>
            <p className="mt-1 font-mono text-[20px] font-semibold">{points((s as Sum).sum)}</p>
            <p className="text-[13px] text-muted">{(s as Sum).count} пополн.</p>
          </div>
        ))}
        <div className="rounded-2xl border border-line bg-panel p-4">
          <p className="text-[12px] uppercase tracking-wider text-muted">Игроков пополняли</p>
          <p className="mt-1 font-mono text-[20px] font-semibold">{data.payers}</p>
          <p className="text-[13px] text-muted">средний чек {points(avg)}</p>
        </div>
      </div>
      <Panel>
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <h2 className="font-semibold">Последние пополнения <span className="ml-2 rounded-md bg-gold/15 px-2 py-0.5 text-[12px] text-gold">демо-касса</span></h2>
          <Button variant="secondary" size="sm" onClick={reload}>Обновить</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead><tr><th className={thCls}>Игрок</th><th className={thCls}>Сумма</th><th className={thCls}>Способ</th><th className={thCls}>Когда</th></tr></thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id} className="border-t border-line/60">
                  <td className={tdCls}><Link href={`/admin/users/${d.user.id}`} className="hover:text-accent">{d.user.username} <span className="font-mono text-[12px] text-muted">{d.user.publicId}</span></Link></td>
                  <td className={`${tdCls} font-mono font-semibold text-accent`}>+{points(d.amount)}</td>
                  <td className={tdCls}>{METHOD[d.method] ?? d.method}</td>
                  <td className={`${tdCls} text-soft`} title={new Date(d.createdAt).toLocaleString("ru-RU")}>{timeAgo(d.createdAt)}</td>
                </tr>
              ))}
              {!data.items.length && <tr><td colSpan={4} className={`${tdCls} text-center text-muted`}>Пополнений пока нет</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
