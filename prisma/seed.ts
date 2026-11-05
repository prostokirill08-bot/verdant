import { PrismaClient } from "@prisma/client";
import { DEFAULT_ACHIEVEMENTS, DEFAULT_QUESTS } from "../src/lib/progress";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/server/security/password";
import { publicId } from "../src/server/security/tokens";
import { hashSeed, newServerSeed } from "../src/server/games/fair";

const db = new PrismaClient();

const GAMES = [
  { slug: "workshop", title: "Emerald Cases", tagline: "Серия сундуков с разными наградами и бонусами", sortOrder: 0 },
  { slug: "blackjack", title: "Blackjack", tagline: "Набери 21 раньше дилера: удвоение, сплит, блэкджек 3:2", sortOrder: 1 },
  { slug: "videopoker", title: "Video Poker", tagline: "Собери сильную комбинацию из пяти карт", sortOrder: 1 },
  { slug: "baccarat", title: "Baccarat", tagline: "Игрок, банкир или ничья — кто ближе к девяти", sortOrder: 1 },
  { slug: "sledrace", title: "Race", tagline: "Выбери участника и следи за гонкой до финиша", sortOrder: 2 },
  { slug: "tower", title: "Tower", tagline: "Поднимайся по уровням и выбирай момент остановки", sortOrder: 3 },
  { slug: "hilo", title: "Hi-Lo", tagline: "Угадай, будет следующая карта выше или ниже", sortOrder: 3 },
  { slug: "wheel", title: "Wheel", tagline: "Запусти колесо и поймай нужный сектор", sortOrder: 3 },
  { slug: "keno", title: "Keno", tagline: "Выбери числа и проверь совпадения", sortOrder: 3 },
  { slug: "coinflip", title: "Coinflip", tagline: "Выбери сторону монеты", sortOrder: 3 },
  { slug: "avalanche", title: "Avalanche", tagline: "Собирай комбинации и открывай каскадные множители", sortOrder: 0 },
  { slug: "salute", title: "Neon Burst", tagline: "Яркие символы, бонусные раунды и крупные комбинации", sortOrder: 0 },
  { slug: "crystal", title: "Crystal Vault", tagline: "Открой кристальные символы и собери выигрышную линию", sortOrder: 0 },
  { slug: "atlas", title: "Atlas of Stars", tagline: "Исследуй символы и активируй расширяющиеся wild-барабаны", sortOrder: 0 },
  { slug: "neon-garden", title: "Neon Garden", tagline: "Неоновые символы и бонусные бесплатные вращения", sortOrder: 0 },
  { slug: "crash", title: "Crash", tagline: "Следи за ростом множителя и забирай вовремя", sortOrder: 1 },
  { slug: "mines", title: "Mines", tagline: "Открывай безопасные клетки и обходи мины", sortOrder: 2 },
  { slug: "dice", title: "Dice", tagline: "Выбери вероятность и брось кости", sortOrder: 3 },
  { slug: "plinko", title: "Plinko", tagline: "Запусти шар сквозь поле множителей", sortOrder: 4 },
  { slug: "limbo", title: "Limbo", tagline: "Проверь, достигнет ли раунд заданного множителя", sortOrder: 5 },
  { slug: "roulette", title: "Roulette", tagline: "Классическая рулетка на 37 секторов", sortOrder: 6 },
];

/** Даты появления игр (для сортировки «по новизне» в каталоге). */
const ADDED: Record<string, string> = {
  crash: "2026-11-02T23:02:14Z", mines: "2026-11-02T23:02:14Z", dice: "2026-11-02T23:02:14Z", plinko: "2026-11-02T23:02:14Z", limbo: "2026-11-02T23:02:14Z", roulette: "2026-11-02T23:02:14Z",
  atlas: "2026-11-03T00:47:02Z", "neon-garden": "2026-11-03T00:47:02Z",
  tower: "2026-11-03T04:13:30Z", hilo: "2026-11-03T04:13:30Z", wheel: "2026-11-03T04:13:30Z", keno: "2026-11-03T04:13:30Z", coinflip: "2026-11-03T04:13:30Z",
  workshop: "2026-11-03T11:12:13Z", blackjack: "2026-11-03T18:41:22Z", videopoker: "2026-11-03T18:41:22Z", baccarat: "2026-11-03T18:41:22Z", sledrace: "2026-11-03T18:41:22Z",
  avalanche: "2026-11-04T21:12:34Z", salute: "2026-11-04T21:12:34Z", crystal: "2026-11-04T21:12:34Z",
};

async function main() {
  for (const g of GAMES) await db.game.upsert({ where: { slug: g.slug }, update: {}, create: { ...g, ...(ADDED[g.slug] ? { addedAt: new Date(ADDED[g.slug]!) } : {}) } });
  await db.setting.upsert({ where: { key: "platform" }, update: {}, create: { key: "platform", value: { maintenance: false, registrationOpen: true, startGrant: 100000, dailyBonus: 25000 } } });

  const email = process.env.ADMIN_EMAIL ?? "admin@verdant.local";
  if (!(await db.user.findUnique({ where: { email } }))) {
    const password = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
    const serverSeed = newServerSeed();
    await db.user.create({ data: {
      email, username: "admin", role: "ADMIN", publicId: publicId(), passwordHash: await hashPassword(password),
      wallet: { create: {} }, seeds: { create: { serverSeed, serverSeedHash: hashSeed(serverSeed), clientSeed: randomBytes(8).toString("hex") } },
    } });
    console.log(`\nАдминистратор создан: ${email} / ${password}\nСохрани пароль — он показывается один раз.\n`);
  }
  // Достижения и ежедневные задания: только добавляем отсутствующие — правки администратора не затираются
  await db.achievementDef.createMany({ data: DEFAULT_ACHIEVEMENTS.map((a) => ({ ...a, reward: BigInt(a.reward) })), skipDuplicates: true });
  await db.questDef.createMany({ data: DEFAULT_QUESTS.map((q) => ({ ...q, reward: BigInt(q.reward) })), skipDuplicates: true });
  console.log("Игры:", (await db.game.count()), "шт. · достижений:", await db.achievementDef.count(), "· заданий:", await db.questDef.count());
}
main().finally(() => db.$disconnect());
