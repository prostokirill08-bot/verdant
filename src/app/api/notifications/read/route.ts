import { z } from "zod";
import { body, route } from "@/server/http";
import { db } from "@/server/db";

const input = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.string().regex(/^[a-z0-9]{10,40}$/)).min(1).max(100) })]);

/** Отметить уведомления прочитанными (только свои — userId в условии). */
export const POST = route({ auth: true, rate: { key: "notif-read", limit: 60, window: 60 } }, async ({ req, user }) => {
  const b = await body(req, input);
  const r = await db.notification.updateMany({ where: { userId: user!.id, readAt: null, ...("ids" in b ? { id: { in: b.ids } } : {}) }, data: { readAt: new Date() } });
  return { marked: r.count, unread: await db.notification.count({ where: { userId: user!.id, readAt: null } }) };
});
