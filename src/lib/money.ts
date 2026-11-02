// Баллы хранятся целыми «сотыми» (bigint). 1 балл = 100.
export const SCALE = 100n;

export function toUnits(points: number | string): bigint {
  const s = typeof points === "number" ? points.toFixed(2) : points.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Неверная сумма");
  const [i, f = ""] = s.split(".");
  return BigInt(i!) * SCALE + BigInt((f + "00").slice(0, 2));
}

export function formatPoints(units: bigint | number | string): string {
  const v = BigInt(units);
  const neg = v < 0n; const a = neg ? -v : v;
  const i = (a / SCALE).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const f = (a % SCALE).toString().padStart(2, "0");
  return (neg ? "−" : "") + i + "," + f;
}

/** Умножение суммы на множитель с округлением вниз до сотых. multiplier — строка или число с ≤ 4 знаками. */
export function mulUnits(units: bigint, multiplier: number): bigint {
  const m = BigInt(Math.floor(multiplier * 10000));
  return (units * m) / 10000n;
}
