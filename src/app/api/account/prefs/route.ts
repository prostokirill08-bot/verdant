import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";

const prefsSchema = z.object({
  sound: z.boolean().optional(),
  volume: z.number().min(0).max(1).optional(),
  animations: z.enum(["on", "reduced", "off"]).optional(),
  quality: z.enum(["high", "low"]).optional(),
}).strict();

export const GET = route({ auth: true }, async ({ user }) => {
  const u = await db.user.findUniqueOrThrow({ where: { id: user!.id }, select: { prefs: true } });
  return { prefs: u.prefs ?? {} };
});

/** Сохранить настройки интерфейса (звук, анимации, качество эффектов) — синхронизируются между устройствами. */
export const PATCH = route({ auth: true, rate: { key: "prefs", limit: 30, window: 60 } }, async ({ req, user }) => {
  const patch = await body(req, prefsSchema);
  const u = await db.user.findUniqueOrThrow({ where: { id: user!.id }, select: { prefs: true } });
  const next = { ...((u.prefs as object) ?? {}), ...patch };
  await db.user.update({ where: { id: user!.id }, data: { prefs: next } });
  return { prefs: next };
});
