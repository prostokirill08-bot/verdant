import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { CAT, GAT, playCatch, playGates, playSweets, SWT } from "./slots3";
import { rngFromArray } from "./slots";

/** Детерминированный поток как у сервера (HMAC) — для повторяемости. */
const stream = (seed: string) => { let i = 0; return () => { const h = createHmac("sha256", seed).update(String(i++)).digest(); return h.readUInt32BE(0) / 2 ** 32; }; };

test("слоты третьей волны: детерминированны и не превышают максимум", () => {
  for (const [play, max] of [[playSweets, SWT.maxWin], [playCatch, CAT.maxWin], [playGates, GAT.maxWin]] as const) {
    for (let k = 0; k < 200; k++) {
      const a = play(stream("s" + k)); const b = play(stream("s" + k));
      assert.deepEqual(a, b);
      assert.ok(a.totalMult >= 0 && a.totalMult <= max);
      const c = play(stream("b" + k), { buy: true });
      assert.ok(c.fs && c.fs.spins.length >= 10);
    }
  }
});

test("Сладкий взрыв: множители клеток не выше ×128 и сохраняются в бонусе", () => {
  for (let k = 0; k < 100; k++) {
    const r = playSweets(stream("sw" + k), { buy: true });
    let prev: Record<string, number> = {};
    for (const s of r.fs!.spins) for (const st of s.steps) {
      for (const [cell, v] of Object.entries(st.spots)) { assert.ok(v <= SWT.maxSpot); assert.ok(v >= (prev[cell] ?? 0)); }
      prev = st.spots;
    }
  }
});

test("Звёздные врата: барабаны растут только вверх и не выше 7 рядов", () => {
  for (let k = 0; k < 100; k++) {
    const r = playGates(stream("g" + k), { buy: true });
    let prev = [3, 3, 3, 3, 3];
    for (const s of r.fs!.spins) {
      s.heights.forEach((h, i) => { assert.ok(h >= prev[i]! && h <= GAT.maxRows); assert.equal(s.grid[i]!.length, h); });
      assert.equal(s.ways, s.heights.reduce((p, h) => p * h, 1));
      prev = s.heights;
    }
  }
});

test("Большой улов: рыбак собирает ценники только в бонусе, уровень не выше ×10", () => {
  for (let k = 0; k < 200; k++) {
    const r = playCatch(stream("c" + k));
    assert.equal(r.base!.collected, 0);
    const b = playCatch(stream("cb" + k), { buy: true });
    for (const s of b.fs!.spins) { assert.ok(CAT.levels[s.level]! <= 10); if (!s.fishers || !s.fish.length) assert.equal(s.collected, 0); }
  }
});

test("пересчёт из массива чисел совпадает с потоком", () => {
  const src = stream("arr"); const arr = Array.from({ length: 60000 }, () => src());
  const a = playSweets(rngFromArray(arr), { buy: true }); const b = playSweets(stream("arr"), { buy: true });
  assert.deepEqual(a, b);
});
