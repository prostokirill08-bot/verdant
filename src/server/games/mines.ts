import { z } from "zod";
import { FLOATS_NEEDED, MINES_TILES, minesLayout, minesMultiplier } from "@/lib/fair/outcomes";
import { db } from "../db";
import { HttpError } from "../http";
import { applyEntry, withUserTx } from "../wallet/ledger";
import { takeFloats } from "./fair";
import { amountSchema } from "./instant";
import { requestKey } from "./play";
import { loadGame, nextNonce, roundView } from "./rounds";

type MinesState = { mines: number[]; revealed: number[] };
type MinesParams = { mines: number; edgeBp: number };

export const minesStart = z.object({ amount: amountSchema, mines: z.number().int().min(1, "Мин от 1 до 24").max(24, "Мин от 1 до 24"), key: requestKey });
export const minesReveal = z.object({ tile: z.number().int().min(0).max(MINES_TILES - 1) });

const active = (tx: Pick<typeof db, "round">, userId: string) =>
  tx.round.findFirst({ where: { userId, gameSlug: "mines", status: "ACTIVE" }, include: { seedPair: true } });

export async function minesActive(userId: string) {
  const r = await active(db, userId);
  return r ? withMult(roundView(r), r) : null;
}

/** Текущий и следующий множитель — для подсказок в интерфейсе. */
function withMult(view: ReturnType<typeof roundView>, r: { params: unknown; state: unknown }) {
  const p = r.params as MinesParams; const s = r.state as MinesState;
  return { ...view, current: minesMultiplier(p.mines, s.revealed.length, p.edgeBp), next: s.revealed.length < MINES_TILES - p.mines ? minesMultiplier(p.mines, s.revealed.length + 1, p.edgeBp) : null };
}

export async function startMines(userId: string, input: z.infer<typeof minesStart>) {
  const betKey = `bet:${userId}:${input.key}`;
  return withUserTx(userId, async (tx) => {
    const dup = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: betKey } });
    if (dup?.roundId) {
      const r = await tx.round.findUniqueOrThrow({ where: { id: dup.roundId }, include: { seedPair: true } });
      return { round: withMult(roundView(r), r), balance: (await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance };
    }
    if (await active(tx, userId)) throw new HttpError(409, "Сначала заверши текущий раунд", "round_active");
    const game = await loadGame(tx, "mines", input.amount);
    const { pair, nonce } = await nextNonce(tx, userId);
    const layout = minesLayout(takeFloats(pair.serverSeed, pair.clientSeed, nonce, FLOATS_NEEDED.mines), input.mines);
    const round = await tx.round.create({
      data: { userId, gameSlug: "mines", seedPairId: pair.id, nonce, betAmount: input.amount, params: { mines: input.mines, edgeBp: game.houseEdgeBp }, state: { mines: layout, revealed: [] } },
      include: { seedPair: true },
    });
    const { entry } = await applyEntry(tx, { userId, type: "BET", amount: -input.amount, idempotencyKey: betKey, roundId: round.id, note: "Mines" });
    return { round: withMult(roundView(round), round), balance: entry.balanceAfter };
  });
}

async function settle(tx: Parameters<Parameters<typeof withUserTx>[1]>[0], userId: string, roundId: string, bet: bigint, state: MinesState, mult: number) {
  const payout = (bet * BigInt(Math.round(mult * 10000))) / 10000n;
  const { entry } = await applyEntry(tx, { userId, type: "WIN", amount: payout, idempotencyKey: `win:${roundId}`, roundId, note: "Mines" });
  const r = await tx.round.update({
    where: { id: roundId }, include: { seedPair: true },
    data: { status: "WON", payout, multiplier: mult, state, result: { mines: state.mines, revealed: state.revealed, cashout: true }, settledAt: new Date() },
  });
  return { round: withMult(roundView(r), r), balance: entry.balanceAfter };
}

export async function revealTile(userId: string, tile: number) {
  return withUserTx(userId, async (tx) => {
    const r = await active(tx, userId);
    if (!r) throw new HttpError(404, "Нет активного раунда", "no_round");
    const p = r.params as MinesParams; const s = r.state as MinesState;
    if (s.revealed.includes(tile)) throw new HttpError(409, "Клетка уже открыта", "revealed");
    if (s.mines.includes(tile)) {
      const done = await tx.round.update({
        where: { id: r.id }, include: { seedPair: true },
        data: { status: "LOST", multiplier: 0, state: { ...s, hit: tile }, result: { mines: s.mines, revealed: s.revealed, hit: tile }, settledAt: new Date() },
      });
      return { round: withMult(roundView(done), done), balance: (await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance };
    }
    const next: MinesState = { ...s, revealed: [...s.revealed, tile] };
    const mult = minesMultiplier(p.mines, next.revealed.length, p.edgeBp);
    // Все безопасные клетки открыты — забираем автоматически
    if (next.revealed.length === MINES_TILES - p.mines) return settle(tx, userId, r.id, r.betAmount, next, mult);
    const upd = await tx.round.update({ where: { id: r.id }, include: { seedPair: true }, data: { state: next, multiplier: mult } });
    return { round: withMult(roundView(upd), upd), balance: (await tx.wallet.findUniqueOrThrow({ where: { userId } })).balance };
  });
}

export async function cashoutMines(userId: string) {
  return withUserTx(userId, async (tx) => {
    const r = await active(tx, userId);
    if (!r) throw new HttpError(404, "Нет активного раунда", "no_round");
    const p = r.params as MinesParams; const s = r.state as MinesState;
    if (s.revealed.length === 0) throw new HttpError(400, "Открой хотя бы одну клетку", "no_reveals");
    return settle(tx, userId, r.id, r.betAmount, s, minesMultiplier(p.mines, s.revealed.length, p.edgeBp));
  });
}
