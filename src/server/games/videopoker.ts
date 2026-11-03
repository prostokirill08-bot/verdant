import { z } from "zod";
import { VP_FLOATS, vpDeck, vpDraw, vpEval } from "@/lib/fair/cards";
import { db } from "../db";
import { amountSchema } from "./instant";
import { requestKey } from "./play";
import { act, findActive, roundView, startRound } from "./stateful";

/** Видеопокер: раздача 5 карт → игрок оставляет нужные → замена → выплата по таблице. Запасные карты скрыты до замены. */
type State = { revealed: { rank: number; suit: number }[]; deck: { rank: number; suit: number }[] };
export const vpStart = z.object({ amount: amountSchema, key: requestKey });
export const vpHold = z.object({ held: z.array(z.boolean()).length(5) });

function view(r: Parameters<typeof roundView>[0]) {
  const v = roundView(r); const s = r.state as State;
  return { ...v, hand: s.revealed, eval: vpEval(s.revealed) };
}

export async function videopokerActive(userId: string) {
  const r = await findActive(db, userId, "videopoker");
  return r ? view(r) : null;
}

export async function startVideopoker(userId: string, input: z.infer<typeof vpStart>) {
  const res = await startRound(userId, "videopoker", input.amount, input.key, VP_FLOATS, (fs) => {
    const deck = vpDeck(fs);
    return { params: {}, state: { revealed: deck.slice(0, 5), deck } };
  });
  return { round: view(res.round), balance: res.balance };
}

export async function drawVideopoker(userId: string, held: boolean[]) {
  const res = await act<State>(userId, "videopoker", 0, (r) => {
    const s = r.state as State; const hand = vpDraw(s.deck, held); const e = vpEval(hand);
    const result = { hand, held: held.map((h) => (h ? "1" : "0")).join(""), combo: e.rank, name: e.name };
    const state = { ...s, revealed: hand };
    return e.mult > 0 ? { state, outcome: { mult: e.mult, result } } : { state, outcome: { lost: true as const, result } };
  });
  return { round: view(res.round), balance: res.balance };
}
