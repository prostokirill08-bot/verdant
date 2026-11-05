import { z } from "zod";
import { body, HttpError, route } from "@/server/http";
import { db } from "@/server/db";
import { GAME_SLUGS, isGameSlug } from "@/lib/games";

export const GET = route({ auth: true }, async ({ user }) => {
  const rows = await db.favorite.findMany({ where: { userId: user!.id }, orderBy: { createdAt: "desc" }, select: { gameSlug: true } });
  return { favorites: rows.map((r) => r.gameSlug) };
});

const slug = z.string().refine(isGameSlug, "Неизвестная игра");
const input = z.union([
  z.object({ slug, on: z.boolean() }),                       // добавить / убрать одну игру
  z.object({ merge: z.array(slug).max(GAME_SLUGS.length) }),  // перенос избранного из браузера после входа
]);

export const POST = route({ auth: true, rate: { key: "fav", limit: 60, window: 60 } }, async ({ req, user }) => {
  const b = await body(req, input); const userId = user!.id;
  if ("merge" in b) {
    if (b.merge.length) await db.favorite.createMany({ data: b.merge.map((gameSlug) => ({ userId, gameSlug })), skipDuplicates: true });
  } else if (b.on) {
    if (!(await db.game.findUnique({ where: { slug: b.slug } }))) throw new HttpError(404, "Игра не найдена", "not_found");
    await db.favorite.createMany({ data: [{ userId, gameSlug: b.slug }], skipDuplicates: true });
  } else {
    await db.favorite.deleteMany({ where: { userId, gameSlug: b.slug } });
  }
  const rows = await db.favorite.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { gameSlug: true } });
  return { favorites: rows.map((r) => r.gameSlug) };
});
