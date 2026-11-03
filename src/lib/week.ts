// Неделя турнира: с понедельника 00:00 по Москве (UTC+3, без перехода на летнее время).
const MSK = 3 * 3600 * 1000, DAY = 24 * 3600 * 1000;
export function weekBounds(now = Date.now()) {
  const d = new Date(now + MSK); const dow = (d.getUTCDay() + 6) % 7;
  const mondayMsk = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
  const start = new Date(mondayMsk - MSK);
  return { id: new Date(mondayMsk).toISOString().slice(0, 10), start, end: new Date(start.getTime() + 7 * DAY) };
}
