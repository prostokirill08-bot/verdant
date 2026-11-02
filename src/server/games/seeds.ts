import { z } from "zod";
import { db } from "../db";
import { HttpError } from "../http";
import { withUserTx } from "../wallet/ledger";
import { createSeedPair } from "./fair";

export const rotateInput = z.object({ clientSeed: z.string().trim().min(1, "Клиентский сид не может быть пустым").max(64, "До 64 символов").regex(/^[\x21-\x7e]+$/, "Только латиница, цифры и символы без пробелов").optional() });

/** Текущая пара (сам серверный сид скрыт) и последние раскрытые пары для проверки. */
export async function fairInfo(userId: string) {
  const [current, revealed] = await Promise.all([
    db.seedPair.findFirst({ where: { userId, active: true } }),
    db.seedPair.findMany({ where: { userId, active: false }, orderBy: { revealedAt: "desc" }, take: 10 }),
  ]);
  return {
    current: current ? { serverSeedHash: current.serverSeedHash, clientSeed: current.clientSeed, nonce: current.nonce } : null,
    revealed: revealed.map((p) => ({ serverSeed: p.serverSeed, serverSeedHash: p.serverSeedHash, clientSeed: p.clientSeed, rounds: p.nonce, revealedAt: p.revealedAt })),
  };
}

/** Смена пары: старый серверный сид раскрывается, новый генерируется. Нельзя во время незавершённого раунда Mines. */
export async function rotateSeed(userId: string, clientSeed?: string) {
  await withUserTx(userId, async (tx) => {
    if (await tx.round.findFirst({ where: { userId, status: "ACTIVE", seedPairId: { not: null } } })) throw new HttpError(409, "Сначала заверши активный раунд Mines", "round_active");
    await tx.seedPair.updateMany({ where: { userId, active: true }, data: { active: false, revealedAt: new Date() } });
    await createSeedPair(tx, userId, clientSeed);
  });
  return fairInfo(userId);
}
