import { z } from "zod";
import { publicUser, PUBLIC_USER_SELECT } from "../security/privacy";
import { crashMultiplierAt, crashTimeFor } from "@/lib/fair/outcomes";
import { db } from "../db";
import { HttpError } from "../http";
import { applyEntry, withUserTx } from "../wallet/ledger";
import { amountSchema } from "../games/instant";
import { requestKey } from "../games/play";
import { loadGame } from "../games/rounds";
import { publish } from "../realtime/bus";

export const BETTING_MS = 7000;   // приём ставок
export const PAUSE_MS = 3500;     // показ результата после обвала
const LATE_MS = 150;              // запас на задержку сети при закрытии приёма ставок

export const crashBetInput = z.object({
  amount: amountSchema,
  autoCashout: z.number().min(1.01, "Автовывод от 1,01×").max(10000, "Автовывод до 10 000×").transform((x) => Math.round(x * 100) / 100).nullable().optional(),
  key: requestKey,
});

type CrashParams = { autoCashout: number | null; edgeBp: number };

/** Публичное состояние раунда — без точки обвала, пока раунд идёт. */
export async function crashSnapshot() {
  const [cur, history] = await Promise.all([
    db.crashRound.findFirst({ where: { status: { in: ["BETTING", "RUNNING"] } }, orderBy: { createdAt: "desc" } }),
    db.crashRound.findMany({ where: { status: "CRASHED" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, crashPoint: true, serverSeed: true, serverSeedHash: true, crashedAt: true } }),
  ]);
  const last = history[0];
  const round = cur ?? (last && last.crashedAt && Date.now() - last.crashedAt.getTime() < PAUSE_MS + 2000 ? await db.crashRound.findUnique({ where: { id: last.id } }) : null);
  const bets = round ? await db.round.findMany({ where: { crashId: round.id }, orderBy: { betAmount: "desc" }, take: 100, include: { user: { select: PUBLIC_USER_SELECT } } }) : [];
  return {
    serverNow: Date.now(),
    round: round ? publicRound(round) : null,
    bets: bets.map((b) => ({
      id: b.id, ...publicUser(b.user), amount: b.betAmount.toString(), auto: (b.params as CrashParams).autoCashout,
      status: b.status, multiplier: Number(b.multiplier), payout: b.payout.toString(),
    })),
    history: history.map((h) => ({ id: h.id, crashPoint: Number(h.crashPoint), serverSeed: h.serverSeed, serverSeedHash: h.serverSeedHash })),
  };
}

export function publicRound(r: { id: string; status: string; serverSeedHash: string; serverSeed: string; crashPoint: unknown; bettingEndsAt: Date; startedAt: Date | null; crashedAt: Date | null }) {
  const crashed = r.status === "CRASHED";
  return {
    id: r.id, status: r.status, hash: r.serverSeedHash,
    bettingEndsAt: r.bettingEndsAt.getTime(), startedAt: r.startedAt?.getTime() ?? null, crashedAt: r.crashedAt?.getTime() ?? null,
    crashPoint: crashed ? Number(r.crashPoint) : null, serverSeed: crashed ? r.serverSeed : null,
  };
}

export async function placeCrashBet(userId: string, input: z.infer<typeof crashBetInput>) {
  const betKey = `bet:${userId}:${input.key}`;
  const res = await withUserTx(userId, async (tx) => {
    const dup = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: betKey } });
    if (dup?.roundId) return { roundId: dup.roundId, balance: (await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance, fresh: false };
    const cr = await tx.crashRound.findFirst({ where: { status: "BETTING" }, orderBy: { createdAt: "desc" } });
    if (!cr || cr.bettingEndsAt.getTime() - LATE_MS < Date.now()) throw new HttpError(409, "Приём ставок закрыт — дождись следующего раунда", "betting_closed");
    if (await tx.round.findFirst({ where: { crashId: cr.id, userId } })) throw new HttpError(409, "Ставка в этом раунде уже сделана", "already_bet");
    const game = await loadGame(tx, "crash", input.amount);
    const round = await tx.round.create({ data: { userId, gameSlug: "crash", crashId: cr.id, betAmount: input.amount, params: { autoCashout: input.autoCashout ?? null, edgeBp: game.houseEdgeBp } } });
    const { entry } = await applyEntry(tx, { userId, type: "BET", amount: -input.amount, idempotencyKey: betKey, roundId: round.id, note: "Crash" });
    return { roundId: round.id, balance: entry.balanceAfter, fresh: true };
  });
  if (res.fresh) {
    const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: PUBLIC_USER_SELECT });
    await publish({ t: "bet", bet: { id: res.roundId, ...publicUser(u), amount: input.amount.toString(), auto: input.autoCashout ?? null } });
  }
  return { roundId: res.roundId, balance: res.balance };
}

/** Выплата по ставке Crash (ручной вывод или автовывод). Возвращает null, если ставка уже рассчитана. */
export async function settleCrashBet(roundId: string, multiplier: number) {
  const bet = await db.round.findUnique({ where: { id: roundId }, select: { userId: true } });
  if (!bet) return null;
  const res = await withUserTx(bet.userId, async (tx) => {
    const r = await tx.round.findUnique({ where: { id: roundId }, include: { user: { select: PUBLIC_USER_SELECT } } });
    if (!r || r.status !== "ACTIVE") return null;
    const payout = (r.betAmount * BigInt(Math.round(multiplier * 100))) / 100n;
    // Условное обновление: если цикл уже записал обвал (LOST), выплаты не будет
    const upd = await tx.round.updateMany({ where: { id: r.id, status: "ACTIVE" }, data: { status: "WON", payout, multiplier, result: { cashout: multiplier }, settledAt: new Date() } });
    if (upd.count === 0) return null;
    const { entry } = await applyEntry(tx, { userId: r.userId, type: "WIN", amount: payout, idempotencyKey: `win:${r.id}`, roundId: r.id, note: "Crash" });
    return { payout, balance: entry.balanceAfter, user: publicUser(r.user).user };
  });
  if (res) await publish({ t: "cashout", cashout: { id: roundId, user: res.user, multiplier, payout: res.payout.toString() } });
  return res;
}

/** Ручной вывод: множитель считает сервер по своим часам, клиентскому значению не доверяем. */
export async function cashoutCrash(userId: string) {
  const cr = await db.crashRound.findFirst({ where: { status: "RUNNING" }, orderBy: { createdAt: "desc" } });
  if (!cr || !cr.startedAt) throw new HttpError(409, "Раунд ещё не начался", "not_running");
  const bet = await db.round.findFirst({ where: { crashId: cr.id, userId } });
  if (!bet || bet.status !== "ACTIVE") throw new HttpError(404, "Нет активной ставки в этом раунде", "no_bet");
  const elapsed = Date.now() - cr.startedAt.getTime();
  const cp = Number(cr.crashPoint);
  if (elapsed >= crashTimeFor(cp)) throw new HttpError(409, `Не успел — обвал на ${cp.toFixed(2)}×`, "too_late");
  let m = crashMultiplierAt(elapsed);
  const auto = (bet.params as CrashParams).autoCashout;
  if (auto && auto <= m) m = auto;
  if (m >= cp) throw new HttpError(409, `Не успел — обвал на ${cp.toFixed(2)}×`, "too_late");
  const res = await settleCrashBet(bet.id, m);
  if (!res) throw new HttpError(409, "Ставка уже рассчитана", "settled");
  return { multiplier: m, payout: res.payout, balance: res.balance };
}
