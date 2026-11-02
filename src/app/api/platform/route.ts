import { route } from "@/server/http";
import { getPlatform } from "@/server/settings";

// Публичные флаги платформы для интерфейса (объявление, техработы, открыта ли регистрация)
export const GET = route({ rate: { key: "platform", limit: 120, window: 60 } }, async () => {
  const s = await getPlatform();
  return { announcement: s.announcement, maintenance: s.maintenance, registrationOpen: s.registrationOpen };
});
