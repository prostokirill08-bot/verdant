"use client";
import { Panel, Stat } from "@/components/play/kit";
import { Badge, Loading, tdCls, thCls, useAdminData } from "@/components/admin/ui";
import { points } from "@/lib/format";
import { GAME_NAMES, isGameSlug } from "@/lib/games";

type Stats = {
  users: { total: number; new24h: number; blocked: number }; sessions: number; rounds: { total: number; last24h: number };
  wagered: { total: string; last24h: string }; payout: { total: string; last24h: string };
  integrity: { walletSum: string; ledgerSum: string; ok: boolean };
  games: { slug: string; rounds: number; wagered: string; payout: string }[];
  series: { day: string; rounds: number; wagered: string; payout: string }[];
};

const rtp = (w: string, p: string) => (BigInt(w) > 0n ? `${(Number((BigInt(p) * 10000n) / BigInt(w)) / 100).toFixed(2)}%` : "—");

export default function AdminOverview() {
  const { data, error } = useAdminData<Stats>("/api/admin/stats");
  if (!data) return <Loading error={error} />;
  const max = Math.max(1, ...data.series.map((s) => Number(s.wagered)));
  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Пользователи" value={`${data.users.total} (+${data.users.new24h} за сутки)`} />
        <Stat label="Активные сессии" value={data.sessions} />
        <Stat label="Раунды за сутки" value={`${data.rounds.last24h} / всего ${data.rounds.total}`} />
        <Stat label="Заблокировано" value={data.users.blocked} tone={data.users.blocked ? "danger" : undefined} />
        <Stat label="Ставки за сутки" value={points(data.wagered.last24h)} />
        <Stat label="Выплаты за сутки" value={points(data.payout.last24h)} />
        <Stat label="RTP всего" value={rtp(data.wagered.total, data.payout.total)} />
        <Stat label="Целостность баланса" value={data.integrity.ok ? "в порядке" : "РАСХОЖДЕНИЕ"} tone={data.integrity.ok ? "accent" : "danger"} />
      </div>

      <Panel className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Ставки и выплаты за 14 дней</h2>
          <div className="flex gap-3 text-[12px] text-muted"><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-accent" />ставки</span><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-soft/60" />выплаты</span></div>
        </div>
        {data.series.length === 0 ? <p className="py-8 text-center text-muted">Пока нет раундов</p> : (
          <div className="flex h-44 items-end gap-2 overflow-x-auto">
            {data.series.map((s) => (
              <div key={s.day} className="flex min-w-9 max-w-16 flex-1 flex-col items-center gap-1" title={`${s.day}: ${s.rounds} раундов, ставки ${points(s.wagered)}, выплаты ${points(s.payout)}`}>
                <div className="flex h-36 w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 rounded-t bg-accent" style={{ height: `${(Number(s.wagered) / max) * 100}%` }} />
                  <div className="w-1/2 rounded-t bg-soft/60" style={{ height: `${(Number(s.payout) / max) * 100}%` }} />
                </div>
                <span className="font-mono text-[10.5px] text-muted">{s.day.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="border-b border-line p-4 font-semibold">По играм</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead><tr><th className={thCls}>Игра</th><th className={`${thCls} text-right`}>Раунды</th><th className={`${thCls} text-right`}>Ставки</th><th className={`${thCls} text-right`}>Выплаты</th><th className={`${thCls} text-right`}>Факт. RTP</th></tr></thead>
            <tbody>
              {data.games.map((g) => (
                <tr key={g.slug} className="border-t border-line/60">
                  <td className={tdCls}>{isGameSlug(g.slug) ? GAME_NAMES[g.slug] : g.slug}</td>
                  <td className={`${tdCls} text-right font-mono`}>{g.rounds}</td>
                  <td className={`${tdCls} text-right font-mono`}>{points(g.wagered)}</td>
                  <td className={`${tdCls} text-right font-mono`}>{points(g.payout)}</td>
                  <td className={`${tdCls} text-right`}><Badge>{rtp(g.wagered, g.payout)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-[12.5px] text-muted">Целостность: сумма всех кошельков {points(data.integrity.walletSum)} = сумма журнала {points(data.integrity.ledgerSum)}.</p>
    </div>
  );
}
