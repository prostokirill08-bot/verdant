import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

/*
 * Provably fair: результат = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`).
 * Хэш serverSeed игрок видит до игры; сам сид раскрывается при смене пары — тогда любой раунд можно проверить.
 * serverSeed берётся из crypto.randomBytes (криптографически стойкий ГСЧ).
 */
type Tx = Prisma.TransactionClient;

export const newServerSeed = () => randomBytes(32).toString("hex");
export const hashSeed = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSeedPair(tx: Tx, userId: string, clientSeed?: string) {
  const serverSeed = newServerSeed();
  return tx.seedPair.create({ data: { userId, serverSeed, serverSeedHash: hashSeed(serverSeed), clientSeed: clientSeed ?? randomBytes(8).toString("hex") } });
}

/** Поток равномерных чисел [0, 1) из HMAC: по 4 байта на число, 8 чисел на блок. */
export function* floats(serverSeed: string, clientSeed: string, nonce: number): Generator<number> {
  for (let cursor = 0; ; cursor++) {
    const h = createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:${cursor}`).digest();
    for (let i = 0; i < 32; i += 4) {
      yield (h[i]! / 256) + (h[i + 1]! / 256 ** 2) + (h[i + 2]! / 256 ** 3) + (h[i + 3]! / 256 ** 4);
    }
  }
}
export function takeFloats(serverSeed: string, clientSeed: string, nonce: number, count: number): number[] {
  const out: number[] = []; const it = floats(serverSeed, clientSeed, nonce);
  while (out.length < count) out.push(it.next().value as number);
  return out;
}
