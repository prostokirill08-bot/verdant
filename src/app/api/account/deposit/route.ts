import { z } from "zod";
import { body, route } from "@/server/http";
import { amountSchema } from "@/server/games/instant";
import { requestKey } from "@/server/games/play";
import { createDeposit, depositInfo } from "@/server/wallet/deposit";

const schema = z.object({ amount: amountSchema, method: z.literal("demo").default("demo"), key: requestKey });

export const GET = route({ auth: true }, async ({ user }) => depositInfo(user!.id));

// Начисление бесплатных демо-рублей: от 300 до 300 000 ₽, повтор с тем же ключом не пополняет второй раз
export const POST = route({ auth: true, rate: { key: "deposit", limit: 30, window: 600 } }, async ({ req, user, ip }) => {
  const p = await body(req, schema);
  const r = await createDeposit(user!.id, p.amount, p.method, p.key, ip);
  return { ok: true, duplicate: r.duplicate, deposit: { id: r.deposit.id, amount: r.deposit.amount, method: r.deposit.method, createdAt: r.deposit.createdAt }, balance: r.balance };
});
