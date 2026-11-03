import { z } from "zod";
import { TOWER_FLOATS, TOWER_FLOORS, TOWER_LEVELS, towerLayout, towerMultiplier, type TowerLevel } from "@/lib/fair/extra";
import { db } from "../db";
import { HttpError } from "../http";
import { amountSchema } from "./instant";
import { requestKey } from "./play";
import { act, findActive, roundView, startRound } from "./stateful";

type State = { traps: number[][]; revealed: number[] };   // revealed — выбранная клетка на каждом пройденном этаже
type Params = { level: TowerLevel; edgeBp: number };

export const towerStart = z.object({ amount: amountSchema, level: z.enum(["easy", "medium", "hard", "expert"]), key: requestKey });
export const towerPick = z.object({ tile: z.number().int().min(0).max(3) });

function view(r: Parameters<typeof roundView>[0]) {
  const p = r.params as Params; const s = r.state as State; const floors = s.revealed.length;
  return { ...roundView(r), current: towerMultiplier(p.level, floors, p.edgeBp), next: floors < TOWER_FLOORS ? towerMultiplier(p.level, floors + 1, p.edgeBp) : null };
}

export async function towerActive(userId: string) {
  const r = await findActive(db, userId, "tower");
  return r ? view(r) : null;
}

export async function startTower(userId: string, input: z.infer<typeof towerStart>) {
  const res = await startRound(userId, "tower", input.amount, input.key, TOWER_FLOATS, (fs) => ({ params: { level: input.level }, state: { traps: towerLayout(fs, input.level), revealed: [] } }));
  return { round: view(res.round), balance: res.balance };
}

export async function pickTower(userId: string, tile: number) {
  const res = await act<State>(userId, "tower", TOWER_FLOATS, (r) => {
    const p = r.params as Params; const s = r.state as State; const floor = s.revealed.length;
    if (tile >= TOWER_LEVELS[p.level].tiles) throw new HttpError(400, "Нет такой клетки", "bad_tile");
    if (s.traps[floor]!.includes(tile)) return { state: { ...s, revealed: [...s.revealed, tile] }, outcome: { lost: true, result: { traps: s.traps, revealed: s.revealed, hit: { floor, tile } } } };
    const next = { ...s, revealed: [...s.revealed, tile] };
    const mult = towerMultiplier(p.level, next.revealed.length, p.edgeBp);
    // Вершина башни — забираем автоматически
    if (next.revealed.length === TOWER_FLOORS) return { state: next, outcome: { mult, result: { traps: s.traps, revealed: next.revealed, top: true } } };
    return { state: next, mult };
  });
  return { round: view(res.round), balance: res.balance };
}

export async function cashoutTower(userId: string) {
  const res = await act<State>(userId, "tower", TOWER_FLOATS, (r) => {
    const p = r.params as Params; const s = r.state as State;
    if (!s.revealed.length) throw new HttpError(400, "Пройди хотя бы один этаж", "no_floors");
    return { state: s, outcome: { mult: towerMultiplier(p.level, s.revealed.length, p.edgeBp), result: { traps: s.traps, revealed: s.revealed, cashout: true } } };
  });
  return { round: view(res.round), balance: res.balance };
}
