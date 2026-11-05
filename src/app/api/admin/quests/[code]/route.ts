import { body, HttpError, route } from "@/server/http";
import { ADMIN_RATE } from "@/server/admin/route-helpers";
import * as P from "@/server/admin/progress";

const codeOf = (c?: string) => { if (!c || !/^[a-z0-9_]{2,40}$/.test(c)) throw new HttpError(404, "Не найдено", "not_found"); return c; };
export const PUT = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ req, user, ip, params }) => {
  const b = await body(req, P.questInput);
  if (b.code !== codeOf(params.code)) throw new HttpError(400, "Код нельзя менять", "bad_code");
  return { item: await P.upsertQuest(user!, b, ip, false) };
});
export const DELETE = route({ auth: "ADMIN", rate: ADMIN_RATE }, async ({ user, ip, params }) => { await P.deleteQuest(user!, codeOf(params.code), ip); return { ok: true }; });
