import { route } from "@/server/http";
import { verifyWallet } from "@/server/wallet/ledger";

export const GET = route({ auth: true, rate: { key: "verify", limit: 20, window: 60 } }, async ({ user }) => verifyWallet(user!.id));
