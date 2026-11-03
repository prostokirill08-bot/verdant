// Сквозные тесты API против запущенного сервера.
// Запуск: BASE_URL=http://localhost:3000 ADMIN_EMAIL=… ADMIN_PASSWORD=… node tests/e2e.mjs [--no-crash]
// Тест создаёт новых пользователей и временно меняет настройки (в конце возвращает их обратно).
import { createHash, createHmac, randomUUID } from "node:crypto";
import WebSocket from "ws";

const B = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN = { login: process.env.ADMIN_EMAIL ?? "admin@verdant.local", password: process.env.ADMIN_PASSWORD ?? "" };
const SKIP_CRASH = process.argv.includes("--no-crash");
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };
const key = () => randomUUID().replace(/-/g, "");
const floatAt = (seed, msg) => { const h = createHmac("sha256", seed).update(msg).digest(); return h[0] / 256 + h[1] / 256 ** 2 + h[2] / 256 ** 3 + h[3] / 256 ** 4; };

/** Клиент со своими cookie — как отдельный браузер. */
class Client {
  jar = {};
  async req(path, body, method) {
    const r = await fetch(B + path, {
      method: method ?? (body ? "POST" : "GET"),
      headers: { cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; "), "content-type": "application/json", origin: B, "x-csrf-token": decodeURIComponent(this.jar.vd_csrf ?? "") },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); const v = kv.slice(i + 1); if (v) this.jar[kv.slice(0, i)] = v; else delete this.jar[kv.slice(0, i)]; }
    return { s: r.status, j: await r.json().catch(() => ({})) };
  }
  balance = async () => BigInt((await this.req("/api/auth/me")).j.balance ?? "0");
}
async function newPlayer() {
  const c = new Client(); const u = "t" + randomUUID().slice(0, 10).replace(/-/g, "");
  const r = await c.req("/api/auth/register", { email: `${u}@test.local`, username: u, password: "Passw0rd1", adult: true });
  if (r.s !== 200) throw new Error("register failed: " + JSON.stringify(r.j));
  c.username = u; c.email = `${u}@test.local`; return c;
}

// ---------- Аутентификация ----------
console.log("— Аутентификация");
const p = await newPlayer();
ok("регистрация и стартовый баланс", (await p.balance()) > 0n);
ok("повторный email → 409", (await new Client().req("/api/auth/register", { email: p.email, username: p.username + "x", password: "Passw0rd1", adult: true })).s === 409);
ok("слабый пароль → 400", (await new Client().req("/api/auth/register", { email: "w" + p.email, username: "w" + p.username, password: "short", adult: true })).s === 400);
ok("без CSRF → 403", (await fetch(B + "/api/account/bonus", { method: "POST", headers: { cookie: `vd_session=${p.jar.vd_session}`, origin: B } })).status === 403);
ok("чужой Origin → 403", (await fetch(B + "/api/account/bonus", { method: "POST", headers: { cookie: Object.entries(p.jar).map(([k, v]) => `${k}=${v}`).join("; "), origin: "https://evil.example", "x-csrf-token": decodeURIComponent(p.jar.vd_csrf) } })).status === 403);
ok("без входа → 401", (await new Client().req("/api/account/profile")).s === 401);
ok("сверка кошелька", (await p.req("/api/account/verify")).j.ok === true);

// ---------- Игры ----------
console.log("— Игры");
let r = await p.req("/api/games/dice/bet", { amount: "10", params: { target: 50, over: true }, key: key() });
ok("dice", r.s === 200 && typeof r.j.round.result.roll === "number");
const k1 = key(); const b0 = await p.balance();
await p.req("/api/games/dice/bet", { amount: "1", params: { target: 50, over: true }, key: k1 });
const b1 = await p.balance();
r = await p.req("/api/games/dice/bet", { amount: "1", params: { target: 50, over: true }, key: k1 });
ok("повтор с тем же ключом не списывает второй раз", r.j.duplicate === true && (await p.balance()) === b1 && b1 <= b0 + 100n);
ok("limbo", (await p.req("/api/games/limbo/bet", { amount: "1", params: { target: 2 }, key: key() })).s === 200);
ok("plinko", (await p.req("/api/games/plinko/bet", { amount: "1", params: { rows: 8, risk: "low" }, key: key() })).j.round?.result.path.length === 8);
ok("roulette", (await p.req("/api/games/roulette/bet", { params: { bets: [{ bet: { kind: "odd" }, amount: "1" }] }, key: key() })).s === 200);
ok("coinflip", (await p.req("/api/games/coinflip/bet", { amount: "1", params: { side: "heads", flips: 2 }, key: key() })).j.round?.result.sides.length === 2);
ok("wheel", (await p.req("/api/games/wheel/bet", { amount: "1", params: { risk: "medium" }, key: key() })).j.round?.result.segment >= 0);
ok("keno", (await p.req("/api/games/keno/bet", { amount: "1", params: { picks: [1, 2, 3, 4, 5] }, key: key() })).j.round?.result.drawn.length === 10);
ok("keno: повтор чисел → 400", (await p.req("/api/games/keno/bet", { amount: "1", params: { picks: [1, 1] }, key: key() })).s === 400);
ok("слот «Атлас»", (await p.req("/api/games/atlas/bet", { amount: "1", params: { buy: false }, key: key() })).j.round?.result.base.grid.length === 5);
ok("слот «Неоновый сад»: покупка бонуса", (await p.req("/api/games/neon-garden/bet", { amount: "1", params: { buy: true }, key: key() })).j.round?.result.fs?.spins.length >= 10);
{ // «Мастерская Санты»: сундуки сохраняются между спинами и совпадают с последним раундом
  let last = null;
  for (let i = 0; i < 15; i++) last = (await p.req("/api/games/workshop/bet", { amount: "1", params: {}, key: key() })).j.round;
  const m = (await p.req("/api/games/workshop/meters")).j.chests?.map((c) => c.have).join(",");
  ok("слот «Мастерская Санты»: сундуки между спинами", last?.result.base.grid.length === 5 && m === last.result.after.map((x) => x.have).join(",") && last.params.meters !== undefined);
}
r = await p.req("/api/tower/start", { amount: "1", level: "hard", key: key() });
ok("tower: старт без раскрытия ловушек", r.s === 200 && !r.j.round.state.traps);
r = await p.req("/api/tower/pick", { tile: 0 });
ok("tower: ход", r.s === 200 && ["ACTIVE", "LOST"].includes(r.j.round.status));
if (r.j.round.status === "ACTIVE") ok("tower: забрать", (await p.req("/api/tower/cashout", {})).j.round?.status === "WON");
r = await p.req("/api/hilo/start", { amount: "1", key: key() });
ok("hilo: старт", r.s === 200 && r.j.round.state.revealed.length === 1);
ok("hilo: забрать без хода → 400", (await p.req("/api/hilo/cashout", {})).s === 400);
r = await p.req("/api/hilo/guess", { guess: r.j.round.odds.higher >= 0.5 ? "higher" : "lower" });
ok("hilo: ход", r.s === 200);
if (r.j.round.status === "ACTIVE" && r.j.round.current > 1) ok("hilo: забрать", (await p.req("/api/hilo/cashout", {})).j.round?.status === "WON");
ok("ставка больше баланса → 400", (await p.req("/api/games/dice/bet", { amount: "9999", params: { target: 50, over: true }, key: key() })).s === 400);
ok("неверные параметры → 400", (await p.req("/api/games/dice/bet", { amount: "1", params: { target: 1, over: true }, key: key() })).s === 400);
const before = await p.balance();
const par = await Promise.all(Array.from({ length: 10 }, () => p.req("/api/games/dice/bet", { amount: "1", params: { target: 50, over: false }, key: key() })));
const paid = par.reduce((s, x) => s + BigInt(x.j.round?.payout ?? 0), 0n);
ok("10 параллельных ставок без потерь", par.every((x) => x.s === 200) && (await p.balance()) === before - 1000n + paid);
r = await p.req("/api/mines/start", { amount: "1", mines: 24, key: key() });
ok("mines: старт", r.s === 200 && !r.j.round.state.mines);
ok("mines: смена сидов во время раунда запрещена", (await p.req("/api/fair", {})).s === 409);
r = await p.req("/api/mines/reveal", { tile: 0 });
ok("mines: клетка открыта", r.s === 200 && ["ACTIVE", "LOST", "WON"].includes(r.j.round.status));
if (r.j.round.status === "ACTIVE") await p.req("/api/mines/cashout", {});
r = await p.req("/api/fair"); const hash = r.j.current.serverSeedHash;
r = await p.req("/api/fair", { clientSeed: "e2e-seed" });
ok("смена пары раскрывает сид с верным хэшем", createHash("sha256").update(r.j.revealed[0].serverSeed).digest("hex") === hash);
const last = (await p.req("/api/games/dice/rounds?scope=mine")).j.rounds[0];
ok("раунд dice пересчитывается по раскрытому сиду", Math.floor(floatAt(last.fair.serverSeed, `${last.fair.clientSeed}:${last.nonce}:0`) * 10001) / 100 === last.result.roll);

if (!SKIP_CRASH) {
  console.log("— Crash (до 2 минут)");
  const events = []; const ws = new WebSocket(B.replace(/^http/, "ws") + "/ws/crash", { headers: { origin: B } });
  ws.on("message", (m) => events.push(JSON.parse(m)));
  await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
  const wait = async (pred, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const e = events.find(pred); if (e) return e; await new Promise((x) => setTimeout(x, 100)); } return null; };
  const bet = await wait((e) => e.t === "state" && e.state.status === "BETTING", 60000);
  ok("crash: приём ставок", !!bet);
  ok("crash: ставка", (await p.req("/api/crash/bet", { amount: "1", autoCashout: 1.01, key: key() })).s === 200);
  const crashed = await wait((e) => e.t === "state" && e.state.status === "CRASHED" && e.state.id === bet?.state.id, 120000);
  ok("crash: сид раскрыт и совпадает с хэшем", !!crashed && createHash("sha256").update(crashed.state.serverSeed).digest("hex") === bet.state.hash);
  ok("crash: точка обвала пересчитывается", !!crashed && Math.max(1, Math.floor((0.99 / (1 - floatAt(crashed.state.serverSeed, "crash:0:0"))) * 100 + 1e-9) / 100) === crashed.state.crashPoint);
  ws.close();
}
ok("баланс сходится с журналом после всех игр", (await p.req("/api/account/verify")).j.ok === true);

// ---------- Админ-панель ----------
console.log("— Админ-панель");
ok("игрок не видит админ-API", (await p.req("/api/admin/stats")).s === 403);
ok("страница /admin для игрока — 404", (await fetch(B + "/admin", { headers: { cookie: `vd_session=${p.jar.vd_session}` } })).status === 404);
if (!ADMIN.password) { console.log("ADMIN_PASSWORD не задан — проверки админки пропущены"); }
else {
  const a = new Client();
  ok("вход администратора", (await a.req("/api/auth/login", { login: ADMIN.login, password: ADMIN.password })).s === 200);
  const me = (await a.req("/api/auth/me")).j.user;
  ok("статистика", (await a.req("/api/admin/stats")).j.integrity?.ok === true);
  const found = (await a.req(`/api/admin/users?q=${p.username}`)).j.users;
  ok("поиск пользователя", found?.length === 1);
  const id = found[0].id;
  const adminId = (await a.req(`/api/admin/users?q=${encodeURIComponent(ADMIN.login)}`)).j.users[0]?.id;
  const bb = await p.balance(); const ak = key();
  r = await a.req(`/api/admin/users/${id}/balance`, { direction: "credit", amount: "100", reason: "тест e2e", key: ak });
  await a.req(`/api/admin/users/${id}/balance`, { direction: "credit", amount: "100", reason: "тест e2e", key: ak });
  ok("начисление (идемпотентно)", r.s === 200 && (await p.balance()) === bb + 10000n);
  ok("списание больше баланса → 400", (await a.req(`/api/admin/users/${id}/balance`, { direction: "debit", amount: "999999", reason: "тест e2e", key: key() })).s === 400);
  ok("нельзя менять себя", (await a.req(`/api/admin/users/${adminId}/status`, { status: "BLOCKED", reason: "тест" })).s === 400);
  ok("блокировка", (await a.req(`/api/admin/users/${id}/status`, { status: "BLOCKED", reason: "тест e2e" })).s === 200);
  ok("сессии заблокированного сброшены", (await p.req("/api/account/profile")).s === 401);
  ok("вход заблокированного → 403", (await new Client().req("/api/auth/login", { login: p.email, password: "Passw0rd1" })).s === 403);
  ok("разблокировка", (await a.req(`/api/admin/users/${id}/status`, { status: "ACTIVE", reason: "тест e2e" })).s === 200);
  ok("снова вход", (await p.req("/api/auth/login", { login: p.email, password: "Passw0rd1" })).s === 200);
  ok("назначить поддержку", (await a.req(`/api/admin/users/${id}/role`, { role: "SUPPORT" })).s === 200);
  ok("поддержка видит статистику", (await p.req("/api/admin/stats")).s === 200);
  ok("поддержка не меняет настройки", (await p.req("/api/admin/settings", { maintenance: true }, "PATCH")).s === 403);
  ok("поддержка не меняет баланс", (await p.req(`/api/admin/users/${id}/balance`, { direction: "credit", amount: "1", reason: "тест", key: key() })).s === 403);
  ok("поддержка не блокирует админа", (await p.req(`/api/admin/users/${adminId}/status`, { status: "BLOCKED", reason: "тест e2e" })).s === 403);
  await a.req(`/api/admin/users/${id}/role`, { role: "USER" });
  ok("выключение игры", (await a.req("/api/admin/games/limbo", { enabled: false }, "PATCH")).s === 200);
  ok("ставка в выключенную игру → 403", (await p.req("/api/games/limbo/bet", { amount: "1", params: { target: 2 }, key: key() })).j.code === "game_disabled");
  await a.req("/api/admin/games/limbo", { enabled: true }, "PATCH");
  ok("неверные лимиты → 400", (await a.req("/api/admin/games/dice", { minBet: "100", maxBet: "10" }, "PATCH")).s === 400);
  const orig = (await a.req("/api/admin/settings")).j.settings;
  await a.req("/api/admin/settings", { maintenance: true, registrationOpen: false }, "PATCH");
  ok("техработы → ставки 503", (await p.req("/api/games/dice/bet", { amount: "1", params: { target: 50, over: true }, key: key() })).s === 503);
  ok("регистрация закрыта → 403", (await new Client().req("/api/auth/register", { email: "closed@test.local", username: "closed_" + Date.now().toString(36).slice(-6), password: "Passw0rd1", adult: true })).s === 403);
  await a.req("/api/admin/settings", { maintenance: orig.maintenance, registrationOpen: orig.registrationOpen }, "PATCH");
  ok("настройки возвращены", (await p.req("/api/games/dice/bet", { amount: "1", params: { target: 50, over: true }, key: key() })).s === 200);
  const audit = (await a.req("/api/admin/audit?action=admin.")).j.items.map((i) => i.action);
  ok("журнал действий админа", ["admin.wallet.adjust", "admin.user.block", "admin.user.role", "admin.game.update", "admin.settings.update"].every((x) => audit.includes(x)));
  const sess = (await a.req("/api/admin/sessions")).j.sessions.find((s) => s.user.id === id);
  ok("завершение сессии из админки", !!sess && (await a.req(`/api/admin/sessions/${sess.ref}`, undefined, "DELETE")).s === 200 && (await p.req("/api/account/profile")).s === 401);
  me && ok("сверка админа", (await a.req("/api/account/verify")).j.ok === true);
}
const h = await fetch(B + "/api/health").then((x) => x.json());
ok("health", h.ok === true && h.db === true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
