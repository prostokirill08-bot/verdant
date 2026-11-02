import { HttpError } from "../http";

/** Лимит запросов к админ-API и проверка формата ID пользователя. */
export const ADMIN_RATE = { key: "admin", limit: 300, window: 60 };
export function userIdParam(id?: string) {
  if (!id || !/^[a-z0-9]{20,40}$/.test(id)) throw new HttpError(404, "Пользователь не найден", "not_found");
  return id;
}
