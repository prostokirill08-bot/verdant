import { createHash } from "node:crypto";
import { appUrl } from "../config";
import { GAME_SLUGS } from "@/lib/games";

/**
 * Telegram-бот платформы. Токен задаётся только переменной окружения TELEGRAM_BOT_TOKEN
 * (Render → Environment) и никуда не выводится. Без токена всё telegram-специфичное просто выключено.
 */
export const botToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
/** Секрет вебхука: Telegram присылает его в заголовке, так чужие запросы на вебхук отсекаются. */
export const webhookSecret = () => createHash("sha256").update(`verdant-webhook:${botToken()}`).digest("hex").slice(0, 48);

const state = globalThis as unknown as { tgBot?: { username: string } | null };
export const botUsername = () => state.tgBot?.username ?? null;

async function call<T = unknown>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`${method}: ${data.description ?? res.status}`);   // токен в сообщение не попадает
  return data.result as T;
}

const DESCRIPTION = "Verdant — новогодние мини-игры: слоты, Crash, Mines, блэкджек, турнир недели и сундук с джекпотом.\n\nДемо-проект: игра идёт только на виртуальные демо-рубли, их нельзя купить или вывести.";

/** Настройка бота при старте сервера: вебхук, кнопка меню «Играть», команды и описание. */
export async function setupBot() {
  if (!botToken()) return;
  const url = appUrl();
  try {
    const me = await call<{ username: string }>("getMe");
    state.tgBot = { username: me.username };
    if (!url.startsWith("https://")) { console.log(`[telegram] бот @${me.username}: сайт не на HTTPS, вебхук и Mini App не настроены`); return; }
    await call("setWebhook", { url: `${url}/api/telegram/webhook`, secret_token: webhookSecret(), allowed_updates: ["message"], drop_pending_updates: true });
    await call("setChatMenuButton", { menu_button: { type: "web_app", text: "Играть", web_app: { url } } });
    await call("setMyCommands", { commands: [{ command: "start", description: "Открыть игры" }, { command: "games", description: "Список игр" }, { command: "help", description: "Что это за бот" }] });
    await call("setMyShortDescription", { short_description: "Новогодние мини-игры на демо-рублях 🎄" }).catch(() => {});
    await call("setMyDescription", { description: DESCRIPTION }).catch(() => {});
    console.log(`[telegram] бот @${me.username} подключён, Mini App: ${url}`);
  } catch (e) {
    console.error("[telegram] не удалось настроить бота:", (e as Error).message);
  }
}

type Message = { chat: { id: number; type: string }; text?: string; from?: { first_name?: string } };
const open = (text: string, path = "") => ({ text, web_app: { url: `${appUrl()}${path}` } });
const FEATURED: [string, string][] = [["🎰 Сундуки удачи", "workshop"], ["🃏 Блэкджек", "blackjack"], ["🚀 Crash", "crash"], ["💣 Mines", "mines"], ["🛷 Большая гонка", "sledrace"], ["🂡 Видеопокер", "videopoker"]];

/** Ответ на сообщение боту. Кнопки web_app открывают сайт внутри Telegram с автоматическим входом. */
export async function handleMessage(m: Message) {
  if (m.chat.type !== "private" || !m.text) return;
  const [cmd, arg] = m.text.trim().split(/\s+/, 2);
  const name = m.from?.first_name?.slice(0, 40) ?? "";
  if (cmd === "/start" || cmd === "/play") {
    // /start <игра> — ссылка вида t.me/бот?start=blackjack сразу ведёт в игру
    const game = arg && (GAME_SLUGS as readonly string[]).includes(arg) ? arg : null;
    await call("sendMessage", {
      chat_id: m.chat.id,
      text: `Привет${name ? `, ${name}` : ""}! 🎄\n\nЭто Verdant — 21 новогодняя игра, сундук со снежными ключами и турнир недели. Вход — через Telegram, ничего вводить не нужно. Демо-рубли бесплатны: их можно получить в кабинете.\n\nДемо-проект: реальных денег здесь нет.`,
      reply_markup: { inline_keyboard: [[open(game ? "▶️ Открыть игру" : "🎮 Играть", game ? `/games/${game}` : "")], [open("🎁 Бонусы и турнир", "/bonuses")]] },
    });
  } else if (cmd === "/games") {
    const rows = FEATURED.map(([t, s]) => [open(t, `/games/${s}`)]);
    await call("sendMessage", { chat_id: m.chat.id, text: "Популярные игры — выбери и играй прямо в Telegram:", reply_markup: { inline_keyboard: [...rows, [open("📋 Все игры", "/games")]] } });
  } else {
    await call("sendMessage", {
      chat_id: m.chat.id,
      text: "Нажми «Играть» внизу или /start — откроется Verdant. /games — популярные игры.\n\nВсе ставки — на демо-рубли: их нельзя купить или вывести.",
      reply_markup: { inline_keyboard: [[open("🎮 Играть")]] },
    });
  }
}
