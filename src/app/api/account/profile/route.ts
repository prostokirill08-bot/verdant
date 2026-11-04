import { z } from "zod";
import { Prisma } from "@prisma/client";
import { route, body, HttpError } from "@/server/http";
import { db } from "@/server/db";
import { usernameSchema } from "@/server/auth/schemas";
import { audit } from "@/server/security/audit";
import { accountSummary } from "@/server/wallet/service";
import { AVATARS } from "@/components/ui/Avatar";

export const GET = route({ auth: true }, async ({ user }) => accountSummary(user!.id));

const schema = z.object({ username: usernameSchema.optional(), avatar: z.enum(Object.keys(AVATARS) as [string, ...string[]]).optional(), hidden: z.boolean().optional() });
export const PATCH = route({ auth: true, rate: { key: "profile", limit: 20, window: 300 } }, async ({ req, user, ip }) => {
  const p = await body(req, schema);
  try { await db.user.update({ where: { id: user!.id }, data: p }); }
  catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "Этот ник уже занят", "taken"); throw e; }
  await audit("account.profile_update", { actorId: user!.id, ip, meta: p });
  return { ok: true };
});
