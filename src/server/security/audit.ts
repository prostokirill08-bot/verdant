import type { Prisma } from "@prisma/client";
import { db } from "../db";

/** Журнал важных действий. Ошибка записи журнала не должна ломать основной запрос. */
export async function audit(action: string, opts: { actorId?: string | null; targetType?: string; targetId?: string; ip?: string | null; meta?: Prisma.InputJsonValue } = {}) {
  try {
    await db.auditLog.create({ data: { action, actorId: opts.actorId ?? null, targetType: opts.targetType, targetId: opts.targetId, ip: opts.ip ?? null, meta: opts.meta } });
  } catch (e) { console.error("[audit]", action, (e as Error).message); }
}
