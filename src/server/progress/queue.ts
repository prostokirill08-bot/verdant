/**
 * Очередь «изменившихся» игроков: после ставки или выигрыша игрок помечается, а фоновый обработчик
 * (jobs.ts, раз в 2 секунды) проверяет его достижения и задания. Хранится на globalThis — общий
 * для маршрутов Next и кода server.ts в одном процессе.
 */
const g = globalThis as unknown as { __vdDirty?: Set<string> };
const set = () => (g.__vdDirty ??= new Set());

export function markDirty(userId: string) { set().add(userId); }
/** Забрать всех помеченных игроков (очередь очищается). */
export function takeDirty(max = 200): string[] {
  const s = set(); const out: string[] = [];
  for (const id of s) { out.push(id); s.delete(id); if (out.length >= max) break; }
  return out;
}
