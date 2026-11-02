import { randomUUID } from "node:crypto";
import { crashPoint, crashTimeFor } from "@/lib/fair/outcomes";
import { db } from "../db";
import { getRedis } from "../redis";
import { applyEntry, withUserTx } from "../wallet/ledger";
import { hashSeed, newServerSeed, takeFloats } from "../games/fair";
import { publish } from "../realtime/bus";
import { BETTING_MS, PAUSE_MS, publicRound, settleCrashBet } from "./service";

/**
 * Игровой цикл Crash: приём ставок → рост множителя → обвал → пауза.
 * Цикл крутит ровно один экземпляр сервера — он держит блокировку в Redis (лидер). Без Redis — текущий процесс.
 * Точка обвала: crashPoint(HMAC_SHA256(serverSeed, "crash:0:0")). Хэш сида публикуется до ставок, сид — после обвала.
 */
const LOCK = "verdant:crash:leader";
const LOCK_TTL = 8000;
const me = randomUUID();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

async function acquire(): Promise<boolean> {
  const redis = getRedis();
  if (!redis || redis.status !== "ready") return true; // одиночный режим
  const ok = await redis.set(LOCK, me, "PX", LOCK_TTL, "NX");
  if (ok) return true;
  if ((await redis.get(LOCK)) === me) { await redis.pexpire(LOCK, LOCK_TTL); return true; }
  return false;
}

/** После перезапуска: незавершённые раунды отменяются, ставки возвращаются. */
async function recover() {
  const stale = await db.crashRound.findMany({ where: { status: { in: ["BETTING", "RUNNING"] } } });
  for (const cr of stale) {
    const bets = await db.round.findMany({ where: { crashId: cr.id, status: "ACTIVE" } });
    for (const b of bets) {
      await withUserTx(b.userId, async (tx) => {
        const r = await tx.round.updateMany({ where: { id: b.id, status: "ACTIVE" }, data: { status: "CANCELLED", settledAt: new Date(), result: { refunded: true } } });
        if (r.count) await applyEntry(tx, { userId: b.userId, type: "REFUND", amount: b.betAmount, idempotencyKey: `refund:${b.id}`, roundId: b.id, note: "Crash: раунд отменён" });
      });
    }
    await db.crashRound.update({ where: { id: cr.id }, data: { status: "CANCELLED" } });
  }
  if (stale.length) console.log(`[crash] отменено незавершённых раундов: ${stale.length}`);
}

async function runRound() {
  const game = await db.game.findUnique({ where: { slug: "crash" } });
  if (!game?.enabled) { await publish({ t: "state", state: { status: "DISABLED" } }); await sleep(5000); return; }

  const serverSeed = newServerSeed();
  const cp = crashPoint(takeFloats(serverSeed, "crash", 0, 1)[0]!, game.houseEdgeBp);
  let cr = await db.crashRound.create({ data: { serverSeed, serverSeedHash: hashSeed(serverSeed), edgeBp: game.houseEdgeBp, crashPoint: cp, bettingEndsAt: new Date(Date.now() + BETTING_MS) } });
  await publish({ t: "state", state: publicRound(cr) });
  await sleep(cr.bettingEndsAt.getTime() - Date.now());

  cr = await db.crashRound.update({ where: { id: cr.id }, data: { status: "RUNNING", startedAt: new Date() } });
  const start = cr.startedAt!.getTime();
  const crashAt = start + crashTimeFor(cp);
  await publish({ t: "state", state: publicRound(cr) });

  // Автовывод: каждая ставка с целью ниже точки обвала выплачивается ровно в момент достижения цели
  const bets = await db.round.findMany({ where: { crashId: cr.id, status: "ACTIVE" } });
  const autos = bets.map((b) => ({ id: b.id, auto: (b.params as { autoCashout: number | null }).autoCashout })).filter((b): b is { id: string; auto: number } => !!b.auto && b.auto < cp);
  const timers = autos.map((b) => new Promise<void>((done) => setTimeout(() => { settleCrashBet(b.id, b.auto).catch((e) => console.error("[crash] auto", e)).finally(done); }, start + crashTimeFor(b.auto) - Date.now())));

  await sleep(crashAt - Date.now());
  await Promise.all(timers);
  cr = await db.crashRound.update({ where: { id: cr.id }, data: { status: "CRASHED", crashedAt: new Date() } });
  await db.round.updateMany({ where: { crashId: cr.id, status: "ACTIVE" }, data: { status: "LOST", multiplier: 0, result: { crashPoint: cp }, settledAt: new Date() } });
  await publish({ t: "state", state: publicRound(cr) });
  await sleep(PAUSE_MS);
}

export async function startCrashEngine() {
  const g = globalThis as unknown as { vdCrash?: boolean };
  if (g.vdCrash) return; g.vdCrash = true;
  let leader = false;
  for (;;) {
    try {
      const got = await acquire();
      if (got && !leader) { console.log("[crash] этот экземпляр ведёт игровой цикл"); await recover(); }
      leader = got;
      if (!leader) { await sleep(2000); continue; }
      const renew = setInterval(() => { void acquire(); }, 2000);
      try { await runRound(); } finally { clearInterval(renew); }
    } catch (e) {
      console.error("[crash] ошибка цикла", e);
      await recover().catch(() => {}); // оборванный раунд отменяем с возвратом ставок
      await sleep(3000);
    }
  }
}
