/**
 * Публичный адрес сайта. Берётся из APP_URL, а на хостингах — из их переменных:
 * Render задаёт RENDER_EXTERNAL_URL, Hugging Face Spaces — SPACE_HOST.
 */
export function appUrl(): string {
  const u = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || (process.env.SPACE_HOST ? `https://${process.env.SPACE_HOST}` : "") || "http://localhost:3000";
  return u.replace(/\/+$/, "");
}
export const isHttps = () => appUrl().startsWith("https://");
