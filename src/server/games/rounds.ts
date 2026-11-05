import type { CrashRound, Prisma, Round, SeedPair } from "@prisma/client";
import { HttpError } from "../http";
import { createSeedPair } from "./fair";
import { WAGERING_ENABLED, WAGERING_OFF_TEXT } from "../flags";

type Tx = Prisma.TransactionClient;
const jsonSafe = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

/** Что игрок видит о раунде. Скрытое состояние (расстановка мин) отдаётся только после окончания раунда. */
export function roundView(r: Round & { seedPair?: Pick<SeedPair, "serverSeedHash" | "clientSeed" | "revealedAt" | "serverSeed"> | null; crash?: CrashRound | null }) {
  const state = (r.state ?? {}) as Record<string, unknown>;
  const finished = r.status !== "ACTIVE";
  return {
    id: r.id, game: r.gameSlug, status: r.status, bet: r.betAmount, payout: r.payout, multiplier: Number(r.multiplier),
    params: r.params, result: r.result, createdAt: r.createdAt, nonce: r.nonce,
    state: finished ? state : { revealed: state.revealed ?? [] },
    fair: r.seedPair ? {
      serverSeedHash: r.seedPair.serverSeedHash, clientSeed: r.seedPair.clientSeed, nonce: r.nonce,
      serverSeed: r.seedPair.revealedAt ? r.seedPair.serverSeed : null,
    } : r.crash ? {
      // Crash: общий сид раунда, раскрывается сразу после обвала
      serverSeedHash: r.crash.serverSeedHash, clientSeed: "crash", nonce: 0,
      serverSeed: r.crash.status === "CRASHED" ? r.crash.serverSeed : null,
      crashPoint: r.crash.status === "CRASHED" ? Number(r.crash.crashPoint) : null,
    } : null,
  };
}

/** Активная пара сидов игрока (создаётся при первой игре). Счётчик nonce растёт на каждый раунд. */
export async function nextNonce(tx: Tx, userId: string) {
  const pair = (await tx.seedPair.findFirst({ where: { userId, active: true } })) ?? (await createSeedPair(tx, userId));
  await tx.seedPair.update({ where: { id: pair.id }, data: { nonce: { increment: 1 } } });
  return { pair, nonce: pair.nonce };
}

export async function loadGame(tx: Tx, slug: string, amount: bigint) {
  const game = await tx.game.findUnique({ where: { slug } });
  if (!game) throw new HttpError(404, "Игра не найдена", "not_found");
  if (!WAGERING_ENABLED) throw new HttpError(403, WAGERING_OFF_TEXT, "wagering_off");
  if (!game.enabled) throw new HttpError(403, "Игра временно отключена", "game_disabled");
  if (amount < game.minBet || amount > game.maxBet) throw new HttpError(400, `Ставка от ${Number(game.minBet) / 100} до ${Number(game.maxBet) / 100} ₽`, "bet_limits");
  const settings = await tx.setting.findUnique({ where: { key: "platform" } });
  if ((settings?.value as { maintenance?: boolean } | null)?.maintenance) throw new HttpError(503, "Технические работы, игры временно недоступны", "maintenance");
  return game;
}

export const toJson = jsonSafe;
