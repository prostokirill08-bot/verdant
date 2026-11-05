import { db } from "./db";

/** Запись системной ошибки (видна в админке). Сама запись никогда не бросает исключений. */
export async function logError(p: { source: "api" | "job" | "client"; message: string; path?: string | null; stack?: string | null; userId?: string | null }) {
  try {
    await db.errorLog.create({ data: { source: p.source, message: p.message.slice(0, 500), path: p.path?.slice(0, 300) ?? null, stack: p.stack?.slice(0, 4000) ?? null, userId: p.userId ?? null } });
  } catch (e) { console.error("[errors] не удалось записать ошибку:", (e as Error).message); }
}
