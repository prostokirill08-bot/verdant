import { route } from "@/server/http";
import { db } from "@/server/db";

/** Уведомления игрока (по 30, курсор — id последнего) и число непрочитанных. */
export const GET = route({ auth: true, rate: { key: "notif", limit: 120, window: 60 } }, async ({ req, user }) => {
  const cursor = req.nextUrl.searchParams.get("cursor");
  const onlyCount = req.nextUrl.searchParams.get("count") === "1";
  const unread = await db.notification.count({ where: { userId: user!.id, readAt: null } });
  if (onlyCount) return { unread };
  const items = await db.notification.findMany({
    where: { userId: user!.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31,
    ...(cursor && /^[a-z0-9]{10,40}$/.test(cursor) ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true },
  });
  return { unread, items: items.slice(0, 30), nextCursor: items.length > 30 ? items[29]!.id : null };
});
