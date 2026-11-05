import { route } from "@/server/http";
import { db } from "@/server/db";
import { touchActivity } from "@/server/progress/activity";

export const GET = route({}, async ({ user }) => {
  if (!user) return { user: null };
  void touchActivity(user.id);   // день активности: достижения «7/30 дней», задание «Посетить платформу»
  const [wallet, extra] = await Promise.all([db.wallet.findUnique({ where: { userId: user.id } }), db.user.findUnique({ where: { id: user.id }, select: { hidden: true, prefs: true } })]);
  return { user: { publicId: user.publicId, username: user.username, email: user.email, role: user.role, avatar: user.avatar, hidden: extra?.hidden ?? false, prefs: extra?.prefs ?? {} }, balance: wallet?.balance ?? 0n, csrf: user.csrfToken };
});
