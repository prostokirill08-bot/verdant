import { db } from "../db";
import { HttpError } from "../http";
import { applyEntry, withTx } from "./ledger";
import { BONUS_COOLDOWN_MS } from "./constants";
import { getPlatform } from "../settings";
import { audit } from "../security/audit";
import { notify } from "../progress/notify";
import { points } from "@/lib/format";

/** Ежедневный бонус. Ключ идемпотентности привязан к дню UTC — двойной клик не начислит дважды. */
export async function claimDailyBonus(userId: string, ip: string) {
  const day = new Date().toISOString().slice(0, 10);
  const amount = BigInt((await getPlatform()).dailyBonus);
  if (amount <= 0n) throw new HttpError(403, "Ежедневный бонус сейчас отключён", "bonus_disabled");
  const res = await withTx(async (tx) => {
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.lastBonusAt && Date.now() - u.lastBonusAt.getTime() < BONUS_COOLDOWN_MS) {
      throw new HttpError(429, "Бонус уже получен. Следующий будет доступен " + new Date(u.lastBonusAt.getTime() + BONUS_COOLDOWN_MS).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) + " (МСК).", "bonus_cooldown");
    }
    const r = await applyEntry(tx, { userId, type: "DEMO_GRANT", amount, idempotencyKey: `bonus:${userId}:${day}`, note: "Ежедневный бонус" });
    if (!r.duplicate) {
      await tx.user.update({ where: { id: userId }, data: { lastBonusAt: new Date() } });
      await notify(userId, { kind: "daily_bonus", title: "Ежедневная награда получена", body: `На баланс зачислено ${points(amount)} демо-кредитов. Следующая — через 24 часа.`, link: "/account" }, tx);
    }
    return r;
  });
  if (!res.duplicate) await audit("wallet.bonus", { actorId: userId, ip });
  return res.entry.balanceAfter;
}

export async function accountSummary(userId: string) {
  const [user, wallet, stats, settings] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { publicId: true, username: true, email: true, avatar: true, role: true, createdAt: true, lastBonusAt: true } }),
    db.wallet.findUniqueOrThrow({ where: { userId } }),
    db.round.aggregate({ where: { userId, status: { in: ["WON", "LOST"] } }, _count: true, _sum: { betAmount: true, payout: true }, _max: { multiplier: true } }),
    getPlatform(),
  ]);
  const wins = await db.round.count({ where: { userId, status: "WON" } });
  const nextBonusAt = user.lastBonusAt ? new Date(user.lastBonusAt.getTime() + BONUS_COOLDOWN_MS) : null;
  return {
    user, balance: wallet.balance,
    bonus: { amount: BigInt(settings.dailyBonus), availableAt: nextBonusAt && nextBonusAt > new Date() ? nextBonusAt : null },
    stats: { rounds: stats._count, wins, wagered: stats._sum.betAmount ?? 0n, returned: stats._sum.payout ?? 0n, bestMultiplier: stats._max.multiplier?.toString() ?? "0" },
  };
}
