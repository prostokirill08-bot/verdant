import { z } from "zod";
import { route } from "@/server/http";
import { countOnline, touchOnline } from "@/server/presence";

const Body = z.object({ sid: z.string().regex(/^[a-z0-9]{8,32}$/) });

// Отметка «я на сайте» (раз в ~25 с) и текущее число игроков онлайн
export const POST = route({ csrf: false, rate: { key: "online", limit: 120, window: 60 } }, async ({ req, user }) => {
  const { sid } = Body.parse(await req.json().catch(() => ({})));
  return { online: await touchOnline(user ? `u:${user.id}` : `g:${sid}`) };
});

export const GET = route({ rate: { key: "online-get", limit: 60, window: 60 } }, async () => ({ online: await countOnline() }));
