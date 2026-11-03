import { route } from "@/server/http";
import { promoSummary } from "@/server/promo/service";

// Акции: сундук со снежными ключами, джекпот, турнир недели и лента призов
export const GET = route({ rate: { key: "promo", limit: 120, window: 60 } }, async ({ user }) => promoSummary(user?.id));
