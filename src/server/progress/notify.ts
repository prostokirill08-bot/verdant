import type { Prisma } from "@prisma/client";
import { db } from "../db";

type Tx = Prisma.TransactionClient;
export type NoticeKind = "achievement" | "quest" | "tournament_start" | "tournament_end" | "daily_bonus" | "system";
export type Notice = { kind: NoticeKind; title: string; body: string; link?: string };

/** Создать уведомление игроку (внутри транзакции, если передан tx). */
export async function notify(userId: string, n: Notice, tx: Tx | typeof db = db) {
  await tx.notification.create({ data: { userId, kind: n.kind, title: n.title.slice(0, 120), body: n.body.slice(0, 400), link: n.link ?? null } });
}

/** Разослать одно уведомление многим игрокам. */
export async function notifyMany(userIds: string[], n: Notice) {
  for (let i = 0; i < userIds.length; i += 500) {
    await db.notification.createMany({ data: userIds.slice(i, i + 500).map((userId) => ({ userId, kind: n.kind, title: n.title, body: n.body, link: n.link ?? null })) });
  }
}
