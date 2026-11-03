import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/server/security/password";
import { publicId } from "../src/server/security/tokens";
import { hashSeed, newServerSeed } from "../src/server/games/fair";

const db = new PrismaClient();

const GAMES = [
  { slug: "tower", title: "Башня", tagline: "Поднимайся по этажам, обходя ловушки", sortOrder: 3 },
  { slug: "hilo", title: "Hi-Lo", tagline: "Угадай: следующая карта выше или ниже", sortOrder: 3 },
  { slug: "wheel", title: "Колесо фортуны", tagline: "20 секторов, три уровня риска", sortOrder: 3 },
  { slug: "keno", title: "Кено", tagline: "Выбери до 10 чисел — выпадет 10 из 40", sortOrder: 3 },
  { slug: "coinflip", title: "Монетка", tagline: "Орёл или решка: серия до 10 бросков", sortOrder: 3 },
  { slug: "atlas", title: "Атлас звёзд", tagline: "Книжный слот: особый символ на весь барабан", sortOrder: 0 },
  { slug: "neon-garden", title: "Неоновый сад", tagline: "Фрукты, джокер и бесплатные вращения ×3", sortOrder: 0 },
  { slug: "crash", title: "Crash", tagline: "Множитель растёт — забери до обвала", sortOrder: 1 },
  { slug: "mines", title: "Mines", tagline: "Открывай клетки и обходи мины", sortOrder: 2 },
  { slug: "dice", title: "Dice", tagline: "Выбери шанс и порог броска", sortOrder: 3 },
  { slug: "plinko", title: "Plinko", tagline: "Шарик падает через ряды штырьков", sortOrder: 4 },
  { slug: "limbo", title: "Limbo", tagline: "Задай цель — множитель решит", sortOrder: 5 },
  { slug: "roulette", title: "Roulette", tagline: "Европейская рулетка на 37 секторов", sortOrder: 6 },
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
