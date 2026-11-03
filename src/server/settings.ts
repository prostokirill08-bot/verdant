import { z } from "zod";
import { db } from "./db";
import { DAILY_BONUS, START_GRANT } from "./wallet/constants";

/** Настройки платформы (таблица Setting, ключ "platform"). Суммы — в сотых долях снежинки. */
export const platformSchema = z.object({
  maintenance: z.boolean(),                 // технические работы: ставки закрыты
  registrationOpen: z.boolean(),            // приём новых регистраций
  startGrant: z.number().int().min(0).max(100_000_000),
  dailyBonus: z.number().int().min(0).max(10_000_000),
  announcement: z.string().max(200),        // строка-объявление над контентом (пусто — скрыта)
});
export type PlatformSettings = z.infer<typeof platformSchema>;

const DEFAULTS: PlatformSettings = { maintenance: false, registrationOpen: true, startGrant: Number(START_GRANT), dailyBonus: Number(DAILY_BONUS), announcement: "" };

export async function getPlatform(): Promise<PlatformSettings> {
  const row = await db.setting.findUnique({ where: { key: "platform" } });
  const parsed = platformSchema.partial().safeParse(row?.value ?? {});
  return { ...DEFAULTS, ...(parsed.success ? parsed.data : {}) };
}

export async function setPlatform(patch: Partial<PlatformSettings>) {
  const next = platformSchema.parse({ ...(await getPlatform()), ...patch });
  await db.setting.upsert({ where: { key: "platform" }, update: { value: next }, create: { key: "platform", value: next } });
  return next;
}
