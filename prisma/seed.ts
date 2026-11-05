import { PrismaClient } from "@prisma/client";
import { DEFAULT_ACHIEVEMENTS, DEFAULT_QUESTS } from "../src/lib/progress";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/server/security/password";
import { publicId } from "../src/server/security/tokens";
import { hashSeed, newServerSeed } from "../src/server/games/fair";

const db = new PrismaClient();

const GAMES = [
  { slug: "workshop", title: "Сундуки удачи", tagline: "Монеты летят в сундуки — каждый сундук открывает свой бонус", sortOrder: 0 },
  { slug: "blackjack", title: "Блэкджек", tagline: "Набери 21 раньше дилера: удвоение, сплит, блэкджек 3:2", sortOrder: 1 },
  { slug: "videopoker", title: "Видеопокер", tagline: "Видеопокер «валеты и выше»: оставь нужные карты — до ×800", sortOrder: 1 },
  { slug: "baccarat", title: "Баккара", tagline: "Игрок, Банкир или Ничья — у кого ближе к 9", sortOrder: 1 },
  { slug: "sledrace", title: "Большая гонка", tagline: "Пять саночников мчатся с горы — угадай победителя", sortOrder: 2 },
  { slug: "tower", title: "Башня", tagline: "Ледяная башня: поднимись к подарку на вершине", sortOrder: 3 },
  { slug: "hilo", title: "Hi-Lo", tagline: "Новогодние карты: следующая выше или ниже?", sortOrder: 3 },
  { slug: "wheel", title: "Колесо фортуны", tagline: "Колесо-леденец: 20 секторов, три уровня риска", sortOrder: 3 },
  { slug: "keno", title: "Кено", tagline: "Ёлочные шары: выбери до 10 чисел из 40", sortOrder: 3 },
  { slug: "coinflip", title: "Монетка", tagline: "Звезда или снежинка: серия до 10 бросков", sortOrder: 3 },
  { slug: "avalanche", title: "Лавина", tagline: "Ледяные символы раскалываются, сверху падают новые; в бонусе растёт множитель", sortOrder: 0 },
  { slug: "salute", title: "Салют", tagline: "1024 способа и ракеты с множителями; в бонусе они шагают вверх и взрываются салютом", sortOrder: 0 },
  { slug: "crystal", title: "Хрустальный шар", tagline: "Шары-загадки раскрываются в один символ; в бонусе прилипают и улучшаются", sortOrder: 0 },
  { slug: "atlas", title: "Атлас звёзд", tagline: "Звёздная книга Деда Мороза: символ раскрывается на весь барабан", sortOrder: 0 },
  { slug: "neon-garden", title: "Волшебный сад", tagline: "Морозные фрукты, эльф и подарки BONUS", sortOrder: 0 },
  { slug: "crash", title: "Crash", tagline: "Санта взлетает на санях — забери, пока он не упал в сугроб", sortOrder: 1 },
  { slug: "mines", title: "Mines", tagline: "Собирай подарки и обходи бомбы в сугробах", sortOrder: 2 },
  { slug: "dice", title: "Dice", tagline: "Ледяные кости: выбери шанс и порог броска", sortOrder: 3 },
  { slug: "plinko", title: "Plinko", tagline: "Ёлочная игрушка скачет по гирлянде", sortOrder: 4 },
  { slug: "limbo", title: "Limbo", tagline: "Рождественская звезда: как высоко она взлетит?", sortOrder: 5 },
  { slug: "roulette", title: "Roulette", tagline: "Праздничная европейская рулетка на 37 секторов", sortOrder: 6 },
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
