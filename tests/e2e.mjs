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
  ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;   // каждый «браузер» — свой адрес
  async req(path, body, method) {
    const r = await fetch(B + path, {
      method: method ?? (body ? "POST" : "GET"),
      headers: { "x-forwarded-for": this.ip, cookie: Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; "), "content-type": "application/json", origin: B, "x-csrf-token": decodeURIComponent(this.jar.vd_csrf ?? "") },
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
  // Стартовых денег нет — пополняем через демо-кассу
  const d = await c.req("/api/account/deposit", { amount: "1000", method: "sbp", key: key() });
  if (d.s !== 200) throw new Error("deposit failed: " + JSON.stringify(d.j));
  c.username = u; c.email = `${u}@test.local`; return c;
}

// ---------- Аутентификация ----------
console.log("— Аутентификация");
const p = await newPlayer();
ok("регистрация + пополнение", (await p.balance()) === 100000n);
{ // Стартовых денег нет; касса: лимиты, идемпотентность, история
  const c = new Client(); await c.req("/api/auth/guest", {});   // гость — чтобы не упираться в лимит регистраций
  ok("касса: новый аккаунт с балансом 0", (await c.balance()) === 0n);
  ok("касса: меньше 300 ₽ → 400", (await c.req("/api/account/deposit", { amount: "299.99", method: "card", key: key() })).s === 400);
  ok("касса: больше 300 000 ₽ → 400", (await c.req("/api/account/deposit", { amount: "300000.01", method: "card", key: key() })).s === 400);
  ok("касса: неизвестный способ → 400", (await c.req("/api/account/deposit", { amount: "500", method: "crypto", key: key() })).s === 400);
  ok("касса: без входа → 401", (await new Client().req("/api/account/deposit", { amount: "500", method: "card", key: key() })).s === 401);
  const k = key();
  const d1 = await c.req("/api/account/deposit", { amount: "300", method: "card", key: k });
  const d2 = await c.req("/api/account/deposit", { amount: "300", method: "card", key: k });
  ok("касса: 300 ₽ зачислены, повтор не зачисляет", d1.s === 200 && d2.j.duplicate === true && (await c.balance()) === 30000n);
  ok("касса: 300 000 ₽ за раз", (await c.req("/api/account/deposit", { amount: "300000", method: "sbp", key: key() })).s === 200);
  await c.req("/api/account/deposit", { amount: "300000", method: "sbp", key: key() });
  await c.req("/api/account/deposit", { amount: "300000", method: "sbp", key: key() });
  const over = await c.req("/api/account/deposit", { amount: "100000", method: "sbp", key: key() });
  ok("касса: суточный лимит 1 000 000 ₽", over.s === 400 && over.j.code === "deposit_limit", JSON.stringify(over.j));
  const info = (await c.req("/api/account/deposit")).j;
  ok("касса: история и остаток лимита", info.items?.length === 4 && info.dayUsed === "90030000");
  const led = (await c.req("/api/account/ledger?type=DEPOSIT")).j;
  ok("касса: записи в журнале", led.items?.length === 4 && led.items.every((i) => i.type === "DEPOSIT"));
  ok("касса: баланс сходится с журналом", (await c.req("/api/account/verify")).j.ok === true);
}
{ // «Демо» без регистрации: гость с демо-рублями, у кого уже есть сессия — новый гость не создаётся
  const g = new Client(); const r1 = await g.req("/api/auth/guest", {});
  const me = (await g.req("/api/auth/me")).j;
  const r2 = await g.req("/api/auth/guest", {});
  ok("демо-гость: вход без регистрации", r1.s === 200 && me.user?.email.endsWith("@guest.local") && BigInt(me.balance) === 0n && r2.j.existing === true);
}
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
// Доигрываем раунд до конца: множитель после хода может быть ровно 1× — тогда забирать ещё нечего, ходим дальше
for (let i = 0; i < 20 && r.j.round?.status === "ACTIVE"; i++) {
  if (r.j.round.current > 1) { r = await p.req("/api/hilo/cashout", {}); ok("hilo: забрать", r.j.round?.status === "WON"); break; }
  r = await p.req("/api/hilo/guess", { guess: r.j.round.odds.higher >= 0.5 ? "higher" : "lower" });
}
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
if (r.j.round.status === "ACTIVE") { const c = await p.req("/api/mines/cashout", {}); if (c.s !== 200) console.log("  mines cashout:", c.s, JSON.stringify(c.j)); }
r = await p.req("/api/fair"); const hash = r.j.current.serverSeedHash;
r = await p.req("/api/fair", { clientSeed: "e2e-seed" }); if (!r.j.revealed) console.log("  fair rotate:", r.s, JSON.stringify(r.j));
ok("смена пары раскрывает сид с верным хэшем", createHash("sha256").update(r.j.revealed[0].serverSeed).digest("hex") === hash);
const last = (await p.req("/api/games/dice/rounds?scope=mine")).j.rounds[0];
ok("раунд dice пересчитывается по раскрытому сиду", Math.floor(floatAt(last.fair.serverSeed, `${last.fair.clientSeed}:${last.nonce}:0`) * 10001) / 100 === last.result.roll);

console.log("— Карточные игры и гонка");
{ // Блэкджек: раздача, ходы до конца; скрытая карта дилера не видна, пока раунд идёт
  let bj = await p.req("/api/blackjack/start", { amount: "2", key: key() });
  ok("блэкджек: раздача", bj.s === 200 && bj.j.round.table.hands[0].cards.length === 2);
  if (bj.j.round.status === "ACTIVE") ok("блэкджек: карта дилера скрыта", bj.j.round.table.dealer.length === 1 && bj.j.round.table.hidden === true);
  ok("блэкджек: вторая раздача во время раунда → 409", bj.j.round.status !== "ACTIVE" || (await p.req("/api/blackjack/start", { amount: "2", key: key() })).s === 409);
  let guard = 0;
  while (bj.j.round?.status === "ACTIVE" && guard++ < 12) {
    const t = bj.j.round.table; const a = t.allowed.double && guard === 1 ? "double" : t.hands[t.active].total.total < 15 ? "hit" : "stand";
    bj = await p.req("/api/blackjack/move", { action: a });
  }
  const fin = bj.j.round;
  ok("блэкджек: раунд завершён, дилер раскрыт", ["WON", "LOST"].includes(fin.status) && fin.table.outcomes?.length >= 1 && fin.table.hidden === false);
  ok("блэкджек: недоступный ход → 404/400", [400, 404].includes((await p.req("/api/blackjack/move", { action: "split" })).s));
}
{ // Видеопокер: раздача → замена; запасные карты не отдаются до замены
  const s1 = await p.req("/api/videopoker/start", { amount: "1", key: key() });
  ok("видеопокер: раздача 5 карт, колода скрыта", s1.s === 200 && s1.j.round.hand.length === 5 && !s1.j.round.state.deck);
  const s2 = await p.req("/api/videopoker/draw", { held: [true, false, true, false, false] });
  ok("видеопокер: замена и итог", s2.s === 200 && ["WON", "LOST"].includes(s2.j.round.status) && s2.j.round.result.held === "10100");
  ok("видеопокер: замена дважды → 404", (await p.req("/api/videopoker/draw", { held: [true, true, true, true, true] })).s === 404);
}
{ // Баккара: сумма ставки = сумма фишек
  const b0 = await p.balance();
  const r1 = await p.req("/api/games/baccarat/bet", { params: { player: "1", banker: "2", tie: "0" }, key: key() });
  const w = r1.j.round?.result?.winner; const pay = BigInt(r1.j.round?.payout ?? -1);
  const want = w === "player" ? 200n : w === "banker" ? 390n : 300n;
  ok("баккара: выплата по правилам", r1.s === 200 && pay === want && (await p.balance()) === b0 - 300n + pay, `${w} ${pay}`);
  ok("баккара: пустая ставка → 400", (await p.req("/api/games/baccarat/bet", { params: {}, key: key() })).s === 400);
}
{ // Гонка на санях
  const r1 = await p.req("/api/games/sledrace/bet", { amount: "1", params: { pick: 4 }, key: key() });
  ok("гонка: результат и порядок финиша", r1.s === 200 && r1.j.round.result.order.length === 5 && r1.j.round.result.order[0] === r1.j.round.result.winner);
  ok("гонка: неверный саночник → 400", (await p.req("/api/games/sledrace/bet", { amount: "1", params: { pick: 7 }, key: key() })).s === 400);
}
{ // Акции: ключи, джекпот, турнир
  const pr = await p.req("/api/promo");
  ok("акции: сводка", pr.s === 200 && BigInt(pr.j.jackpot.pool) >= 2500000n && pr.j.keys.need === 4 && Array.isArray(pr.j.tournament.top));
  ok("акции: открыть сундук без ключей → 400", (await p.req("/api/promo/chest", {})).s === 400);
  ok("акции: гость видит сводку без входа", (await new Client().req("/api/promo")).s === 200);
}

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
ok("игрок не видит админ-API (404, будто его нет)", (await p.req("/api/admin/stats")).s === 404);
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
  ok("поддержка не меняет настройки", (await p.req("/api/admin/settings", { maintenance: true }, "PATCH")).s === 404);
  ok("поддержка не меняет баланс", (await p.req(`/api/admin/users/${id}/balance`, { direction: "credit", amount: "1", reason: "тест", key: key() })).s === 404);
  { // Поддержка видит почту только замаскированной и не ищет по почте
    const sup = (await p.req(`/api/admin/users/${id}`)).j.user?.email ?? "";
    const byMail = (await p.req(`/api/admin/users?q=${encodeURIComponent(p.email)}`)).j.users ?? [];
    ok("поддержка: почта скрыта (k***@…)", /^.\*\*\*@/.test(sup) && sup !== p.email, sup);
    ok("поддержка: поиск по почте не работает", byMail.length === 0);
    ok("админ видит почту полностью", (await a.req(`/api/admin/users/${id}`)).j.user?.email === p.email);
  }
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
// ---------- Telegram Mini App ----------
// Нужен сервер, запущенный с TELEGRAM_BOT_TOKEN; тест подписывает initData тем же токеном, как это делает Telegram.
const TG = process.env.TELEGRAM_BOT_TOKEN;
if (TG) {
  console.log("— Telegram");
  const sign = (f) => { const chk = Object.entries(f).map(([k, v]) => `${k}=${v}`).sort().join("\n"); const sec = createHmac("sha256", "WebAppData").update(TG).digest(); return new URLSearchParams({ ...f, hash: createHmac("sha256", sec).update(chk).digest("hex") }).toString(); };
  const tgId = 900000000 + Math.floor(Math.random() * 99999999);
  const initData = sign({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: tgId, first_name: "Игрок", username: "kq" }) });
  const t = new Client();
  r = await t.req("/api/auth/telegram", { initData });
  const me = (await t.req("/api/auth/me")).j;
  ok("telegram: вход по initData создаёт аккаунт", r.s === 200 && r.j.created === true && me.user?.email === `tg_${tgId}@telegram.local` && BigInt(me.balance) === 0n, JSON.stringify(r.j));
  ok("telegram: ник случайный, без данных Telegram", /^player_[a-z0-9]{6}$/.test(me.user?.username ?? ""), me.user?.username);
  ok("telegram: повторный вход — тот же аккаунт", (await t.req("/api/auth/telegram", { initData })).j.same === true);
  const t2 = new Client(); await t2.req("/api/auth/telegram", { initData });
  ok("telegram: с другого устройства — тот же аккаунт", (await t2.req("/api/auth/me")).j.user?.publicId === me.user?.publicId);
  await t.req("/api/account/deposit", { amount: "300", method: "sbp", key: key() });
  ok("telegram: можно играть", (await t.req("/api/games/dice/bet", { amount: "1", params: { target: 50, over: true }, key: key() })).s === 200);
  ok("telegram: поддельная подпись → 401", (await new Client().req("/api/auth/telegram", { initData: initData.replace(String(tgId), String(tgId + 1)) })).s === 401);
  // Привязка: вошёл в обычный аккаунт внутри Telegram → Telegram привязывается к нему
  const pl = await newPlayer(); const id2 = tgId + 1;
  await pl.req("/api/auth/telegram", { initData: sign({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: id2, first_name: "Player" }) }) });
  ok("telegram: привязка к обычному аккаунту", (await pl.req("/api/auth/me")).j.user?.username === pl.username);
  const wh = createHash("sha256").update(`verdant-webhook:${TG}`).digest("hex").slice(0, 48);
  const hook = (secret) => fetch(B + "/api/telegram/webhook", { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) }, body: JSON.stringify({ update_id: 1, message: { chat: { id: 1, type: "private" }, text: "/start" } }) }).then((x) => x.status);
  ok("telegram: вебхук без секрета → 401", (await hook("")) === 401 && (await hook("x".repeat(48))) === 401);
  ok("telegram: вебхук с секретом → 200", (await hook(wh)) === 200);
}

// ---------- Приватность ----------
console.log("— Приватность");
{
  // Анонимный режим: ник не появляется в публичных лентах
  const h = await newPlayer();
  await h.req("/api/account/profile", { hidden: true }, "PATCH");
  let won = null;
  for (let i = 0; i < 40 && !won; i++) { const x = await h.req("/api/games/dice/bet", { amount: "1", params: { target: 5, over: true }, key: key() }); if (x.j.round?.status === "WON") won = x.j.round; }
  const feed = JSON.stringify((await new Client().req("/api/feed/wins")).j) + JSON.stringify((await new Client().req("/api/games/dice/rounds")).j);
  ok("анонимный режим: ника нет в лентах", !!won && !feed.includes(h.username) && feed.includes("Скрытый игрок"));
  ok("анонимный режим: в своей истории ник виден", (await h.req(`/api/rounds/${won?.id}`)).j.round?.user === h.username);
  ok("чужой раунд анонимного игрока — без ника", (await new Client().req(`/api/rounds/${won?.id}`)).j.round?.user === "Скрытый игрок");
  // Свои сеансы — без IP
  const ss = (await h.req("/api/account/sessions")).j.sessions ?? [];
  ok("сеансы: IP не отдаётся", ss.length > 0 && ss.every((s) => !("ip" in s)));
  // Перебор логинов: несуществующий логин блокируется так же, как существующий
  const ghost = "nobody_" + randomUUID().slice(0, 8) + "@test.local"; let last = 0;
  for (let i = 0; i < 6; i++) last = (await new Client().req("/api/auth/login", { login: ghost, password: "Wrong1234" })).s;
  ok("перебор: несуществующий логин тоже «заблокирован» (423)", last === 423);
  // Удаление аккаунта
  ok("удаление: без ника не удаляет", (await h.req("/api/account/delete", { confirm: "x", password: "Passw0rd1" })).s === 400);
  ok("удаление: неверный пароль → 400", (await h.req("/api/account/delete", { confirm: h.username, password: "Wrong1234" })).s === 400);
  ok("удаление аккаунта", (await h.req("/api/account/delete", { confirm: h.username, password: "Passw0rd1" })).s === 200 && (await h.req("/api/auth/me")).j.user === null);
  ok("удалённый не входит", (await new Client().req("/api/auth/login", { login: h.email, password: "Passw0rd1" })).s === 401);
  // Заголовки безопасности
  const hd = (await fetch(B + "/")).headers;
  ok("заголовки: no-referrer, HSTS, без X-Powered-By", hd.get("referrer-policy") === "no-referrer" && /max-age=/.test(hd.get("strict-transport-security") ?? "") && !hd.get("x-powered-by"));
}

const h = await fetch(B + "/api/health").then((x) => x.json());
ok("health", h.ok === true && h.db === true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
