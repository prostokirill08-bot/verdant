import { route } from "@/server/http";
import { botUsername } from "@/server/telegram/bot";

// Имя бота для ссылки «Играть в Telegram» (null — бот не подключён)
export const GET = route({}, async () => ({ bot: botUsername() }));
