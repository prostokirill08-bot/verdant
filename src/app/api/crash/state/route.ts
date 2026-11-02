import { route } from "@/server/http";
import { crashSnapshot } from "@/server/crash/service";

// Снимок состояния на случай, если WebSocket недоступен
export const GET = route({ rate: { key: "crash-state", limit: 120, window: 60 } }, async () => crashSnapshot());
