import { route } from "@/server/http";
import { db } from "@/server/db";

export const GET = route({}, async ({ user }) => {
  if (!user) return { user: null };
  const [wallet, extra] = await Promise.all([db.wallet.findUnique({ where: { userId: user.id } }), db.user.findUnique({ where: { id: user.id }, select: { hidden: true } })]);
  return { user: { publicId: user.publicId, username: user.username, email: user.email, role: user.role, avatar: user.avatar, hidden: extra?.hidden ?? false }, balance: wallet?.balance ?? 0n, csrf: user.csrfToken };
});
