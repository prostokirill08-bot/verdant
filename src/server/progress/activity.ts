import { db } from "../db";
import { markDirty } from "./queue";
import { mskDay } from "@/lib/week";

const seen = globalThis as unknown as { __vdSeen?: Map<string, string> };

/** Отметить, что игрок был на платформе сегодня. В БД пишем не чаще раза в сутки на игрока. */
export async function touchActivity(userId: string) {
  const day = mskDay().id; const map = (seen.__vdSeen ??= new Map());
  if (map.get(userId) === day) return;
  map.set(userId, day);
  if (map.size > 50_000) map.clear();
  try {
    const r = await db.activityDay.createMany({ data: [{ userId, day }], skipDuplicates: true });
    if (r.count) markDirty(userId);   // новый день: задание «Посетить платформу», серии
  } catch { map.delete(userId); }
}
