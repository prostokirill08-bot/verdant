// Клиентское форматирование сумм (приходят строками в сотых).
/** Значок игровой валюты — DC, виртуальные демо-кредиты (бесплатные, купить или вывести нельзя). */
export const SNOW = "DC";
const CUR = "\u00a0" + SNOW;
export function points(units: string | number | bigint | null | undefined): string {
  if (units === null || units === undefined) return "0,00" + CUR;
  const v = BigInt(units); const neg = v < 0n; const a = neg ? -v : v;
  const i = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "−" : "") + i + "," + (a % 100n).toString().padStart(2, "0") + CUR;
}
export const mult = (m: number | string) => Number(m).toFixed(2) + "×";
export function timeAgo(d: string | Date): string {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "только что"; if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`; return new Date(d).toLocaleDateString("ru-RU");
}
