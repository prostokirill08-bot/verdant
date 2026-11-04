// Карточные и быстрые игры: Блэкджек, Видеопокер, Баккара, Race.
// Чистые функции «числа из HMAC → результат», одинаково работают на сервере и на странице проверки честности.

export type Card = { rank: number; suit: number };   // rank 1 (туз) … 13 (король), suit 0–3
/** Карта из бесконечной колоды: одно число → одна из 52 карт. */
export const cardOf = (f: number): Card => { const n = Math.floor(f * 52); return { rank: (n % 13) + 1, suit: Math.floor(n / 13) }; };
const floor2 = (x: number) => Math.floor(x * 100 + 1e-9) / 100;

// ============================== Блэкджек ==============================
// Бесконечная колода (каждая карта — следующее число потока). Дилер стоит на всех 17, проверяет блэкджек
// при тузе или десятке в открытую, блэкджек платит 3:2. Удвоение на любых двух картах (и после сплита),
// один сплит, на разделённых тузах — по одной карте. RTP ≈ 99,5% при базовой стратегии.
export const BJ_FLOATS = 48;
export type BjHand = { cards: Card[]; bet: 1 | 2; done: boolean; split: boolean; doubled?: boolean };
export type BjState = { hands: BjHand[]; active: number; dealer: Card[]; next: number; actions: string; finished: boolean };
export type BjAction = "hit" | "stand" | "double" | "split";
/** Запись ходов для проверки: h — ещё, s — хватит, d — удвоить, p — разделить. */
const ACTION_CODE: Record<BjAction, string> = { hit: "h", stand: "s", double: "d", split: "p" };

const cardPts = (r: number) => (r === 1 ? 11 : r >= 10 ? 10 : r);
export function bjTotal(cards: Card[]): { total: number; soft: boolean } {
  let t = 0, aces = 0;
  for (const c of cards) { t += cardPts(c.rank); if (c.rank === 1) aces++; }
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}
export const isBlackjack = (h: { cards: Card[]; split?: boolean }) => !h.split && h.cards.length === 2 && bjTotal(h.cards).total === 21;

export function bjDeal(fs: number[]): BjState {
  const s: BjState = { hands: [{ cards: [cardOf(fs[0]!), cardOf(fs[2]!)], bet: 1, done: false, split: false }], active: 0, dealer: [cardOf(fs[1]!), cardOf(fs[3]!)], next: 4, actions: "", finished: false };
  const up = s.dealer[0]!.rank; const peek = up === 1 || up >= 10;
  // Блэкджек у игрока или (после проверки) у дилера — раунд сразу заканчивается
  if (isBlackjack(s.hands[0]!) || (peek && isBlackjack({ cards: s.dealer }))) { s.hands[0]!.done = true; s.finished = true; }
  else if (bjTotal(s.hands[0]!.cards).total === 21) s.hands[0]!.done = true;
  return s;
}

/** Какие действия доступны в текущей руке. */
export function bjAllowed(s: BjState): Record<BjAction, boolean> {
  const h = s.hands[s.active];
  if (s.finished || !h || h.done) return { hit: false, stand: false, double: false, split: false };
  const two = h.cards.length === 2;
  return {
    hit: true, stand: true, double: two,
    split: two && s.hands.length === 1 && cardPts(h.cards[0]!.rank) === cardPts(h.cards[1]!.rank),
  };
}

function advance(s: BjState, fs: number[]) {
  // Следующая незавершённая рука; когда все сыграны — добирает дилер
  while (s.active < s.hands.length && s.hands[s.active]!.done) s.active++;
  if (s.active < s.hands.length) return;
  const live = s.hands.some((h) => bjTotal(h.cards).total <= 21);
  if (live) while (bjTotal(s.dealer).total < 17) s.dealer.push(cardOf(fs[s.next++]!));
  s.finished = true;
}

export function bjAct(prev: BjState, action: BjAction, fs: number[]): BjState {
  const s: BjState = JSON.parse(JSON.stringify(prev));
  if (!bjAllowed(s)[action]) throw new Error("not_allowed");
  if (s.next + 3 >= fs.length) throw new Error("deck_end");
  const h = s.hands[s.active]!; const draw = () => cardOf(fs[s.next++]!);
  s.actions += ACTION_CODE[action];
  if (action === "hit") { h.cards.push(draw()); if (bjTotal(h.cards).total >= 21) h.done = true; }
  if (action === "stand") h.done = true;
  if (action === "double") { h.bet = 2; h.doubled = true; h.cards.push(draw()); h.done = true; }
  if (action === "split") {
    const [a, b] = h.cards as [Card, Card];
    const h1: BjHand = { cards: [a, draw()], bet: 1, done: false, split: true };
    const h2: BjHand = { cards: [b, draw()], bet: 1, done: false, split: true };
    for (const x of [h1, h2]) if (a.rank === 1 || bjTotal(x.cards).total === 21) x.done = true;   // тузы — по одной карте
    s.hands = [h1, h2]; s.active = 0;
  }
  advance(s, fs);
  return s;
}

/** Выплата в единицах базовой ставки и сумма ставок (с учётом удвоений и сплита). */
export function bjSettle(s: BjState): { staked: number; ret: number; outcomes: ("win" | "lose" | "push" | "blackjack")[] } {
  const d = bjTotal(s.dealer).total; const dBj = isBlackjack({ cards: s.dealer });
  let staked = 0, ret = 0; const outcomes: ("win" | "lose" | "push" | "blackjack")[] = [];
  for (const h of s.hands) {
    staked += h.bet; const p = bjTotal(h.cards).total; const pBj = isBlackjack(h);
    let o: "win" | "lose" | "push" | "blackjack";
    if (pBj && dBj) o = "push"; else if (pBj) o = "blackjack"; else if (dBj) o = "lose";
    else if (p > 21) o = "lose"; else if (d > 21 || p > d) o = "win"; else if (p === d) o = "push"; else o = "lose";
    ret += o === "blackjack" ? h.bet * 2.5 : o === "win" ? h.bet * 2 : o === "push" ? h.bet : 0;
    outcomes.push(o);
  }
  return { staked, ret, outcomes };
}

/** Повтор раунда по записанным ходам (для страницы проверки). */
export function bjReplay(fs: number[], actions: string): BjState {
  const map: Record<string, BjAction> = { h: "hit", s: "stand", d: "double", p: "split" };
  let s = bjDeal(fs);
  for (const ch of actions) { if (s.finished) break; s = bjAct(s, map[ch] ?? "stand", fs); }
  return s;
}

// ============================== Видеопокер ==============================
// «Валеты и выше», таблица 9/6 — RTP 99,54% при оптимальной игре. Колода из 52 карт без повторов:
// первые 10 позиций частичного тасования — 5 карт раздачи и 5 запасных на замену по порядку.
export const VP_FLOATS = 10;
export const VP_PAYS = [
  ["royal", "Роял-флеш", 800], ["straight_flush", "Стрит-флеш", 50], ["four", "Каре", 25], ["full_house", "Фулл-хаус", 9],
  ["flush", "Флеш", 6], ["straight", "Стрит", 4], ["three", "Тройка", 3], ["two_pair", "Две пары", 2], ["jacks", "Пара валетов+", 1],
] as const;
export type VpRank = (typeof VP_PAYS)[number][0] | "nothing";

export function vpDeck(fs: number[]): Card[] {
  const pool = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 0; i < 10; i++) { const j = i + Math.floor(fs[i]! * (52 - i)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  return pool.slice(0, 10).map((n) => ({ rank: (n % 13) + 1, suit: Math.floor(n / 13) }));
}
export function vpEval(hand: Card[]): { rank: VpRank; mult: number; name: string } {
  const counts = new Map<number, number>(); for (const c of hand) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = hand.every((c) => c.suit === hand[0]!.suit);
  const ranks = [...counts.keys()].sort((a, b) => a - b);
  const wheel = ranks.join() === "1,2,3,4,5", broadway = ranks.join() === "1,10,11,12,13";
  const straight = counts.size === 5 && (ranks[4]! - ranks[0]! === 4 || broadway || wheel);
  let rank: VpRank = "nothing";
  if (straight && flush) rank = broadway ? "royal" : "straight_flush";
  else if (groups[0] === 4) rank = "four";
  else if (groups[0] === 3 && groups[1] === 2) rank = "full_house";
  else if (flush) rank = "flush";
  else if (straight) rank = "straight";
  else if (groups[0] === 3) rank = "three";
  else if (groups[0] === 2 && groups[1] === 2) rank = "two_pair";
  else if (groups[0] === 2 && [...counts].some(([r, n]) => n === 2 && (r === 1 || r >= 11))) rank = "jacks";
  const row = VP_PAYS.find((p) => p[0] === rank);
  return { rank, mult: row ? row[2] : 0, name: row ? row[1] : "Нет комбинации" };
}
/** Замена карт: незадержанные позиции получают запасные карты 5, 6, 7… по порядку. */
export function vpDraw(deck: Card[], held: boolean[]): Card[] {
  let k = 5; return deck.slice(0, 5).map((c, i) => (held[i] ? c : deck[k++]!));
}

// ============================== Баккара ==============================
// Бесконечная колода, классические правила третьей карты. Игрок 1:1, Банкир 0,95:1, Ничья 8:1
// (при ничьей ставки на Игрока и Банкира возвращаются). RTP: Банкир 98,9%, Игрок 98,8%.
export const BAC_FLOATS = 6;
export const BAC_MULT = { player: 2, banker: 1.95, tie: 9 } as const;
export type BacSide = keyof typeof BAC_MULT;
const bacPts = (c: Card) => (c.rank >= 10 ? 0 : c.rank);
const bacSum = (cs: Card[]) => cs.reduce((s, c) => s + bacPts(c), 0) % 10;
export function baccarat(fs: number[]) {
  const player = [cardOf(fs[0]!), cardOf(fs[2]!)]; const banker = [cardOf(fs[1]!), cardOf(fs[3]!)];
  let p = bacSum(player), b = bacSum(banker);
  if (p < 8 && b < 8) {
    let third: number | null = null;
    if (p <= 5) { const c = cardOf(fs[4]!); player.push(c); third = bacPts(c); p = bacSum(player); }
    const bankerDraws = third === null ? b <= 5
      : b <= 2 || (b === 3 && third !== 8) || (b === 4 && third >= 2 && third <= 7) || (b === 5 && third >= 4 && third <= 7) || (b === 6 && third >= 6 && third <= 7);
    if (bankerDraws) { banker.push(cardOf(fs[5]!)); b = bacSum(banker); }
  }
  const winner: BacSide = p > b ? "player" : b > p ? "banker" : "tie";
  return { player, banker, playerScore: p, bankerScore: b, winner };
}
/** Выплата по ставкам на три поля (в любых единицах). */
export function baccaratPayout(bets: Record<BacSide, bigint>, winner: BacSide): bigint {
  if (winner === "tie") return bets.tie * 9n + bets.player + bets.banker;
  return winner === "player" ? bets.player * 2n : (bets.banker * 195n) / 100n;
}

// ============================== Race ==============================
// 5 саночников с разными шансами. Победитель — по первому числу; порядок остальных — по следующим.
export const SLEDS = [
  { name: "Пингвин Пип", emoji: "🐧", color: "#5b8cff", p: 0.36 },
  { name: "Лис Рыжик", emoji: "🦊", color: "#ff8a3d", p: 0.26 },
  { name: "Мишка Бурый", emoji: "🐻", color: "#c08457", p: 0.18 },
  { name: "Зайка Снежок", emoji: "🐰", color: "#e7ecff", p: 0.12 },
  { name: "Олень Звёздный", emoji: "🦌", color: "#ffd166", p: 0.08 },
] as const;
export const SLED_FLOATS = 6;
export const sledMult = (i: number, edgeBp: number) => floor2((1 - edgeBp / 10000) / SLEDS[i]!.p);
export function sledRace(fs: number[]): { winner: number; order: number[] } {
  let x = fs[0]!, winner = SLEDS.length - 1;
  for (let i = 0; i < SLEDS.length; i++) { if ((x -= SLEDS[i]!.p) < 0) { winner = i; break; } }
  const rest = SLEDS.map((_, i) => i).filter((i) => i !== winner).sort((a, b) => fs[1 + a]! - fs[1 + b]!);
  return { winner, order: [winner, ...rest] };
}
