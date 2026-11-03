import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/server/security/password";
import { publicId } from "../src/server/security/tokens";
import { hashSeed, newServerSeed } from "../src/server/games/fair";

const db = new PrismaClient();

const GAMES = [
  { slug: "workshop", title: "Мастерская Санты", tagline: "Монеты летят в сундуки — каждый сундук открывает свой бонус", sortOrder: 0 },
  { slug: "blackjack", title: "Блэкджек у камина", tagline: "Набери 21 раньше дилера: удвоение, сплит, блэкджек 3:2", sortOrder: 1 },
  { slug: "videopoker", title: "Снежный покер", tagline: "Видеопокер «валеты и выше»: оставь нужные карты — до ×800", sortOrder: 1 },
  { slug: "baccarat", title: "Баккара", tagline: "Игрок, Банкир или Ничья — у кого ближе к 9", sortOrder: 1 },
  { slug: "sledrace", title: "Гонка на санях", tagline: "Пять саночников мчатся с горы — угадай победителя", sortOrder: 2 },
  { slug: "tower", title: "Башня", tagline: "Ледяная башня: поднимись к подарку на вершине", sortOrder: 3 },
  { slug: "hilo", title: "Hi-Lo", tagline: "Новогодние карты: следующая выше или ниже?", sortOrder: 3 },
  { slug: "wheel", title: "Колесо фортуны", tagline: "Колесо-леденец: 20 секторов, три уровня риска", sortOrder: 3 },
  { slug: "keno", title: "Кено", tagline: "Ёлочные шары: выбери до 10 чисел из 40", sortOrder: 3 },
  { slug: "coinflip", title: "Монетка", tagline: "Звезда или снежинка: серия до 10 бросков", sortOrder: 3 },
  { slug: "atlas", title: "Атлас звёзд", tagline: "Звёздная книга Деда Мороза: символ раскрывается на весь барабан", sortOrder: 0 },
  { slug: "neon-garden", title: "Зимний сад", tagline: "Морозные фрукты, эльф и подарки BONUS", sortOrder: 0 },
  { slug: "crash", title: "Crash", tagline: "Санта взлетает на санях — забери, пока он не упал в сугроб", sortOrder: 1 },
  { slug: "mines", title: "Mines", tagline: "Собирай подарки и обходи бомбы в сугробах", sortOrder: 2 },
  { slug: "dice", title: "Dice", tagline: "Ледяные кости: выбери шанс и порог броска", sortOrder: 3 },
  { slug: "plinko", title: "Plinko", tagline: "Ёлочная игрушка скачет по гирлянде", sortOrder: 4 },
  { slug: "limbo", title: "Limbo", tagline: "Рождественская звезда: как высоко она взлетит?", sortOrder: 5 },
  { slug: "roulette", title: "Roulette", tagline: "Праздничная европейская рулетка на 37 секторов", sortOrder: 6 },
];

async function main() {
  for (const g of GAMES) await db.game.upsert({ where: { slug: g.slug }, update: {}, create: g });
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
  console.log("Игры:", (await db.game.count()), "шт.");
}
main().finally(() => db.$disconnect());
