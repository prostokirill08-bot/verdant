import { z } from "zod";
import { HILO_MAX_CARDS, hiloCard, hiloOdds, hiloStepMult } from "@/lib/fair/extra";
import { db } from "../db";
import { HttpError } from "../http";
import { amountSchema } from "./instant";
import { requestKey } from "./play";
import { act, findActive, roundView, startRound } from "./stateful";

/** Открытая история карт: card — индекс числа в потоке, guess — ход, который привёл к этой карте. */
type Step = { i: number; rank: number; suit: number; guess: "start" | "higher" | "lower" | "skip"; ok: boolean; mult: number };
type State = { revealed: Step[]; mult: number; skips: number };
const MAX_SKIPS = 10, MAX_MULT = 10000;
const floor4 = (x: number) => Math.floor(x * 10000 + 1e-9) / 10000;

export const hiloStart = z.object({ amount: amountSchema, key: requestKey });
export const hiloGuess = z.object({ guess: z.enum(["higher", "lower", "skip"]) });

function view(r: Parameters<typeof roundView>[0]) {
  const s = r.state as State; const edgeBp = (r.params as { edgeBp: number }).edgeBp; const last = s.revealed[s.revealed.length - 1]!;
  const o = hiloOdds(last.rank);
  return { ...roundView(r), current: s.mult, odds: { higher: o.higher, lower: o.lower, higherMult: floor4(s.mult * hiloStepMult(o.higher, edgeBp)), lowerMult: floor4(s.mult * hiloStepMult(o.lower, edgeBp)) }, skipsLeft: MAX_SKIPS - s.skips };
}

export async function hiloActive(userId: string) {
  const r = await findActive(db, userId, "hilo");
  return r ? view(r) : null;
}

export async function startHilo(userId: string, input: z.infer<typeof hiloStart>) {
  const res = await startRound(userId, "hilo", input.amount, input.key, 1, (fs) => {
    const c = hiloCard(fs[0]!);
    return { params: {}, state: { revealed: [{ i: 0, ...c, guess: "start", ok: true, mult: 1 }], mult: 1, skips: 0 } };
  });
  return { round: view(res.round), balance: res.balance };
}

export async function guessHilo(userId: string, guess: "higher" | "lower" | "skip") {
  const res = await act<State>(userId, "hilo", HILO_MAX_CARDS, (r, fs) => {
    const s = r.state as State; const edgeBp = (r.params as { edgeBp: number }).edgeBp;
    const last = s.revealed[s.revealed.length - 1]!; const i = last.i + 1;
    if (i >= HILO_MAX_CARDS) throw new HttpError(400, "Колода раунда закончилась — забери выигрыш", "deck_end");
    const card = hiloCard(fs[i]!);
    if (guess === "skip") {
      if (s.skips >= MAX_SKIPS) throw new HttpError(400, "Пропуски закончились", "no_skips");
      return { state: { ...s, skips: s.skips + 1, revealed: [...s.revealed, { i, ...card, guess, ok: true, mult: s.mult }] }, mult: s.mult };
    }
    const o = hiloOdds(last.rank); const ok = guess === "higher" ? card.rank >= last.rank : card.rank <= last.rank;
    const mult = ok ? Math.min(floor4(s.mult * hiloStepMult(guess === "higher" ? o.higher : o.lower, edgeBp)), MAX_MULT) : 0;
    const next: State = { ...s, mult: ok ? mult : s.mult, revealed: [...s.revealed, { i, ...card, guess, ok, mult }] };
    if (!ok) return { state: next, outcome: { lost: true, result: { cards: next.revealed } } };
    if (mult >= MAX_MULT) return { state: next, outcome: { mult, result: { cards: next.revealed, capped: true } } };
    return { state: next, mult };
  });
  return { round: view(res.round), balance: res.balance };
}

export async function cashoutHilo(userId: string) {
  const res = await act<State>(userId, "hilo", 1, (r) => {
    const s = r.state as State;
    if (s.mult <= 1) throw new HttpError(400, "Угадай хотя бы одну карту", "no_guesses");
    return { state: s, outcome: { mult: s.mult, result: { cards: s.revealed, cashout: true } } };
  });
  return { round: view(res.round), balance: res.balance };
}
