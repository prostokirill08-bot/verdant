import { route } from "@/server/http";
import { openChest } from "@/server/promo/service";

export const POST = route({ auth: true, rate: { key: "chest", limit: 20, window: 60 } }, async ({ user }) => openChest(user!.id));
