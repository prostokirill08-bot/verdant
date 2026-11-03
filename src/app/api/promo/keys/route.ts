import { route } from "@/server/http";
import { myKeys } from "@/server/promo/service";

export const GET = route({ auth: true, rate: { key: "keys", limit: 600, window: 60 } }, async ({ user }) => myKeys(user!.id));
