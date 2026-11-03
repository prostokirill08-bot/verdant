import { route, HttpError } from "@/server/http";
import { db } from "@/server/db";

const SLOTS = new Set(["atlas", "neon-garden"]);

// Сколько обычных спинов игрок сделал в слоте с последнего бонуса, выпавшего сам (купленные бонусы не считаются)
export const GET = route({ rate: { key: "rounds", limit: 120, window: 60 } }, async ({ user, params }) => {
  const slug = params.slug!;
  if (!SLOTS.has(slug)) throw new HttpError(404, "Игра не найдена", "not_found");
  if (!user) return { spins: null };
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "Round" r
    WHERE r."userId" = ${user.id} AND r."gameSlug" = ${slug} AND r.status <> 'ACTIVE'
      AND COALESCE(r.result->>'bought', 'false') <> 'true'
      AND r."createdAt" > COALESCE((
        SELECT max(x."createdAt") FROM "Round" x
        WHERE x."userId" = ${user.id} AND x."gameSlug" = ${slug} AND x.status <> 'ACTIVE'
          AND COALESCE(x.result->>'bought', 'false') <> 'true'
          AND (jsonb_typeof(x.result->'fs') = 'object' OR jsonb_typeof(x.result->'feature') = 'object')
      ), 'epoch'::timestamp)`;
  return { spins: rows[0]?.n ?? 0 };
});
