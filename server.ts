/**
 * Точка входа: Next.js + WebSocket на одном порту.
 * /ws/crash — поток событий Crash (только чтение; ставки идут через REST с проверкой сессии и CSRF).
 */
import "./src/realtime/env";
import { createServer, type IncomingMessage } from "node:http";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();
const MAX_PER_IP = 12;

async function main() {
await app.prepare();
// Серверные модули грузим после инициализации Next
const { startCrashEngine } = await import("@/server/crash/engine");
const { crashSnapshot } = await import("@/server/crash/service");
const { subscribe } = await import("@/server/realtime/bus");
const { startJobs } = await import("@/server/jobs");
const { db } = await import("@/server/db");
const upgradeNext = app.getUpgradeHandler();
const server = createServer((req, res) => handle(req, res));
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
const perIp = new Map<string, number>();
const alive = new WeakSet<WebSocket>();

const ipOf = (req: IncomingMessage) => (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.socket.remoteAddress || "?";

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname !== "/ws/crash") return void upgradeNext(req, socket, head);
  // Подключения только со своего сайта
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) { socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); return void socket.destroy(); }
  const ip = ipOf(req);
  if ((perIp.get(ip) ?? 0) >= MAX_PER_IP) { socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n"); return void socket.destroy(); }
  wss.handleUpgrade(req, socket, head, (ws) => {
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    ws.on("message", () => { /* клиент ничего не отправляет */ });
    ws.on("close", () => { const n = (perIp.get(ip) ?? 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip); });
    crashSnapshot().then((s) => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ t: "snapshot", ...s }))).catch(() => ws.close());
  });
});

subscribe((ev) => {
  const msg = JSON.stringify({ ...ev, serverNow: Date.now() });
  for (const c of wss.clients) if (c.readyState === c.OPEN) c.send(msg);
});

// Отключаем «мёртвые» соединения
setInterval(() => {
  for (const c of wss.clients) { if (!alive.has(c)) { c.terminate(); continue; } alive.delete(c); c.ping(); }
}, 30000).unref();

server.listen(port, () => console.log(`> Verdant: http://localhost:${port} (${dev ? "dev" : "production"})`));
void startCrashEngine();
startJobs();

// Корректная остановка: перестаём принимать соединения, закрываем сокеты и БД.
// Оборванный раунд Crash отменится с возвратом ставок при следующем запуске.
let stopping = false;
const shutdown = (sig: string) => {
  if (stopping) return; stopping = true;
  console.log(`[server] ${sig}: остановка…`);
  for (const c of wss.clients) c.close(1012, "restart");
  server.close(() => { void db.$disconnect().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(0), 8000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => { console.error(e); process.exit(1); });
