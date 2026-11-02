import { route } from "@/server/http";
import { db } from "@/server/db";

export const GET = route({}, async ({ user }) => {
  if (!user) return { user: null };
  const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
  return { user: { publicId: user.publicId, username: user.username, email: user.email, role: user.role, avatar: user.avatar }, balance: wallet?.balance ?? 0n, csrf: user.csrfToken };
});
