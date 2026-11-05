// Неделя турнира: с понедельника 00:00 по Москве (UTC+3, без перехода на летнее время).
const MSK = 3 * 3600 * 1000, DAY = 24 * 3600 * 1000;
export function weekBounds(now = Date.now()) {
  const d = new Date(now + MSK); const dow = (d.getUTCDay() + 6) % 7;
  const mondayMsk = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
  const start = new Date(mondayMsk - MSK);
  return { id: new Date(mondayMsk).toISOString().slice(0, 10), start, end: new Date(start.getTime() + 7 * DAY) };
}

/** Сутки по Москве: id вида 2026-11-05 и границы в UTC. */
export function mskDay(now = Date.now()) {
  const d = new Date(now + MSK);
  const startMsk = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const start = new Date(startMsk - MSK);
  return { id: new Date(startMsk).toISOString().slice(0, 10), start, end: new Date(start.getTime() + DAY) };
}
/** Границы суток по их id (YYYY-MM-DD, Москва). */
export function mskDayBounds(id: string) {
  const startMsk = Date.parse(`${id}T00:00:00Z`);
  const start = new Date(startMsk - MSK);
  return { id, start, end: new Date(start.getTime() + DAY) };
}
/** Соседние сутки: shift = -1 — вчера. */
export const shiftDay = (id: string, shift: number) => new Date(Date.parse(`${id}T00:00:00Z`) + shift * DAY).toISOString().slice(0, 10);
