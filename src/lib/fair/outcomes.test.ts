import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { floats, takeFloats } from "@/server/games/fair";
import { browserFloats } from "./browser";
import * as O from "./outcomes";

const rnd = (n: number) => takeFloats(randomBytes(16).toString("hex"), "test", 1, n);

test("браузерный и серверный генераторы совпадают", async () => {
  const s = randomBytes(32).toString("hex");
  assert.deepEqual(await browserFloats(s, "abc", 7, 24), takeFloats(s, "abc", 7, 24));
});

test("числа равномерны в [0, 1)", () => {
  const it = floats("seed", "client", 0); let sum = 0; const N = 50000;
  for (let i = 0; i < N; i++) { const f = it.next().value as number; assert.ok(f >= 0 && f < 1); sum += f; }
  assert.ok(Math.abs(sum / N - 0.5) < 0.01);
});

test("Dice: RTP ≈ 99%", () => {
  const it = floats("dice", "c", 0); let ret = 0; const N = 200000;
  const m = O.diceMultiplier(50, true, 100);
  for (let i = 0; i < N; i++) if (O.diceWin(O.diceRoll(it.next().value as number), 50, true)) ret += m;
  assert.ok(Math.abs(ret / N - 0.99) < 0.01, `rtp ${ret / N}`);
});

test("Limbo: шанс достичь 2× ≈ 49,5%", () => {
  const it = floats("limbo", "c", 0); let hit = 0; const N = 200000;
  for (let i = 0; i < N; i++) if (O.limboResult(it.next().value as number, 100) >= 2) hit++;
  assert.ok(Math.abs(hit / N - 0.495) < 0.006, `p ${hit / N}`);
});

test("Plinko: все таблицы с RTP 97–99,5% и симметричны", () => {
  for (const r of O.PLINKO_ROWS) for (const k of O.PLINKO_RISKS) {
    const t = O.PLINKO_TABLE[r][k]; assert.equal(t.length, r + 1);
    assert.deepEqual([...t].reverse(), t);
    const rtp = O.plinkoRtp(r, k); assert.ok(rtp > 0.97 && rtp < 0.995, `${r}/${k} ${rtp}`);
  }
});

test("Mines: расстановка без повторов, множитель как в формуле", () => {
  for (let i = 0; i < 500; i++) {
    const m = 1 + (i % 24); const l = O.minesLayout(rnd(24), m);
    assert.equal(new Set(l).size, m); assert.ok(l.every((x) => x >= 0 && x < 25));
  }
  assert.equal(O.minesMultiplier(3, 1, 100), Math.floor((25 / 22) * 0.99 * 10000) / 10000);
  assert.equal(O.minesMultiplier(24, 1, 100), 24.75);
});

test("Рулетка: выплаты по ставкам", () => {
  assert.equal(O.roulettePayout({ kind: "straight", n: 17 }, 17), 36);
  assert.equal(O.roulettePayout({ kind: "red" }, 0), 0);
  assert.equal(O.roulettePayout({ kind: "black" }, 2), 2);
  assert.equal(O.roulettePayout({ kind: "column", n: 1 }, 34), 3);
  assert.equal(O.roulettePayout({ kind: "dozen", n: 3 }, 36), 3);
  assert.equal(new Set(O.ROULETTE_WHEEL).size, 37);
});

test("Crash: кривая и обратная функция согласованы", () => {
  assert.equal(O.crashMultiplierAt(O.crashTimeFor(2) + 1), 2);
  assert.ok(O.crashPoint(0, 100) === 1);
});

test("Слоты: результат воспроизводится по сиду (сервер = браузер)", async () => {
  const { playAtlas, playNeon, rngFromArray, SLOT_FLOATS } = await import("./slots");
  for (let n = 0; n < 30; n++) {
    const it = floats("slot-seed", "client", n); const fromServer = () => it.next().value as number;
    const arr = await browserFloats("slot-seed", "client", n, SLOT_FLOATS);
    assert.deepEqual(playAtlas(fromServer), playAtlas(rngFromArray(arr)));
    const it2 = floats("slot-seed", "client", n); const arr2 = takeFloats("slot-seed", "client", n, SLOT_FLOATS);
    assert.deepEqual(playNeon(() => it2.next().value as number, { buy: true }), playNeon(rngFromArray(arr2), { buy: true }));
  }
});

test("Слоты: RTP в разумных пределах", async () => {
  const { playAtlas, playNeon } = await import("./slots");
  for (const fn of [playAtlas, playNeon]) {
    const it = floats("rtp", "c", 0); const rng = () => it.next().value as number;
    let ret = 0; const N = 60000;
    for (let i = 0; i < N; i++) ret += fn(rng).totalMult;
    assert.ok(ret / N > 0.8 && ret / N < 1.1, `rtp ${ret / N}`);
  }
});

test("Новые игры: колесо RTP 99%, кено без повторов, башня и hi-lo по формулам", async () => {
  const X = await import("./extra");
  for (const r of X.WHEEL_RISKS) { assert.equal(X.WHEEL[r].length, 20); assert.ok(Math.abs(X.WHEEL[r].reduce((a, b) => a + b, 0) / 20 - 0.99) < 1e-9, r); }
  for (let i = 0; i < 300; i++) { const d = X.kenoDraw(rnd(10)); assert.equal(new Set(d).size, 10); assert.ok(d.every((n) => n >= 1 && n <= 40)); }
  for (const lv of Object.keys(X.TOWER_LEVELS) as (keyof typeof X.TOWER_LEVELS)[]) {
    const l = X.towerLayout(rnd(X.TOWER_FLOATS), lv);
    assert.equal(l.length, X.TOWER_FLOORS); assert.ok(l.every((t) => t.length === X.TOWER_LEVELS[lv].traps && t.every((x) => x < X.TOWER_LEVELS[lv].tiles)));
  }
  assert.equal(X.towerMultiplier("hard", 1, 100), 1.98);
  assert.equal(X.coinMultiplier(1, 100), 1.98);
  const o = X.hiloOdds(7); assert.ok(Math.abs(o.higher + o.lower - 14 / 13) < 1e-12);
  // Кено: RTP таблиц по гипергеометрическому распределению — 95–98%
  const C = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
  for (let k = 1; k <= 10; k++) {
    const rtp = X.KENO_PAYS[k]!.reduce((s, m, h) => s + m * (C(k, h) * C(40 - k, 10 - h)) / C(40, 10), 0);
    assert.ok(rtp > 0.95 && rtp < 0.98, `keno ${k}: ${rtp}`);
  }
});

test("Интрига: включается после второго бонус-символа", async () => {
  const { anticipationFrom } = await import("./slots");
  const g = (cols: string[][]) => cols;
  assert.equal(anticipationFrom(g([["b", "x"], ["x", "x"], ["b", "x"], ["x", "x"], ["x", "x"]]), "b"), 3);
  assert.equal(anticipationFrom(g([["b", "b"], ["x", "x"], ["x", "x"], ["x", "x"], ["x", "x"]]), "b"), 1);
  assert.equal(anticipationFrom(g([["b", "x"], ["x", "x"], ["x", "x"], ["x", "x"], ["b", "x"]]), "b"), null);
});
