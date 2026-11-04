import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { AVA, CRY, playAvalanche, playCrystal, playSalute, SAL } from "./slots2";

// Детерминированный поток чисел — как HMAC-поток на сервере
function stream(seed: string) { let i = 0; return () => { const h = createHmac("sha256", seed).update(String(i++)).digest(); return h.readUInt32BE(0) / 2 ** 32; }; }

test("новые слоты: одинаковый поток — одинаковый результат (пересчёт на «Честности»)", () => {
  for (const play of [playAvalanche, playSalute, playCrystal]) {
    for (const buy of [false, true]) assert.deepEqual(play(stream("s1"), { buy }), play(stream("s1"), { buy }));
  }
});

test("«Лавина»: каскад убирает только выигрышные клетки, множитель в бонусе растёт", () => {
  for (let k = 0; k < 40; k++) {
    const r = playAvalanche(stream("a" + k), { buy: true });
    assert.ok(r.totalMult <= AVA.maxWin);
    let x = 1;
    for (const s of r.fs!.spins) {
      for (const st of s.steps) { assert.equal(st.x, x); if (st.wins.length) { x++; for (const w of st.wins) assert.ok(w.count >= 8); } }
      assert.equal(s.xAfter, x);
    }
  }
});

test("«Салют»: ракеты в бонусе поднимаются на ряд за вращение", () => {
  for (let k = 0; k < 40; k++) {
    const r = playSalute(stream("b" + k), { buy: true });
    assert.ok(r.totalMult <= SAL.maxWin);
    const sp = r.fs!.spins;
    for (let i = 1; i < sp.length; i++) for (const rk of sp[i - 1]!.rockets) {
      const moved = sp[i]!.rockets.find((y) => y.id === rk.id);
      if (moved) assert.equal(moved.row, rk.row - 1); else assert.ok(sp[i]!.burst.some((y) => y.id === rk.id));
    }
  }
});

test("«Crystal Vault»: шары липнут, символ в бонусе поднимается по лестнице", () => {
  for (let k = 0; k < 40; k++) {
    const r = playCrystal(stream("c" + k), { buy: true });
    assert.ok(r.totalMult <= CRY.maxWin);
    r.fs!.spins.forEach((s, i) => {
      assert.equal(s.level, i);
      if (s.reveal) assert.equal(s.reveal, CRY.ladder[Math.min(i, CRY.ladder.length - 1)]);
      if (i > 0) for (const o of r.fs!.spins[i - 1]!.orbs) assert.ok(s.orbs.includes(o));
    });
  }
});
