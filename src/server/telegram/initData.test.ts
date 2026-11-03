import { test } from "node:test";
import assert from "node:assert/strict";
import { signInitData, verifyInitData } from "./initData";

const TOKEN = "123456:TEST-token-for-unit-tests";
const now = Date.now();
const fields = (extra: Record<string, string> = {}) => ({ auth_date: String(Math.floor(now / 1000)), query_id: "AAF", user: JSON.stringify({ id: 777001, first_name: "Кирилл", username: "kris_test" }), ...extra });

test("telegram initData: правильная подпись принимается", () => {
  const d = verifyInitData(signInitData(fields({ start_param: "blackjack" }), TOKEN), TOKEN, 3600, now);
  assert.equal(d?.user.id, 777001);
  assert.equal(d?.user.username, "kris_test");
  assert.equal(d?.startParam, "blackjack");
});

test("telegram initData: подделка и чужой токен отклоняются", () => {
  const raw = signInitData(fields(), TOKEN);
  assert.equal(verifyInitData(raw, "999:other"), null);
  assert.equal(verifyInitData(raw.replace("777001", "777002"), TOKEN), null);           // подменили пользователя
  assert.equal(verifyInitData(raw.replace(/hash=[0-9a-f]+/, "hash=" + "0".repeat(64)), TOKEN), null);
  assert.equal(verifyInitData(raw.replace(/&?hash=[0-9a-f]+/, ""), TOKEN), null);
  assert.equal(verifyInitData("", TOKEN), null);
});

test("telegram initData: устаревшие данные отклоняются", () => {
  const old = signInitData(fields({ auth_date: String(Math.floor(now / 1000) - 2 * 86400) }), TOKEN);
  assert.equal(verifyInitData(old, TOKEN, 86400, now), null);
});
