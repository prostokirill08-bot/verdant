import type { NextConfig } from "next";

// Заголовки безопасности для всех страниц. CSP строгая: свои скрипты, шрифты Google и SDK Telegram Mini App.
// X-Frame-Options не ставим: он не умеет «только Telegram», вместо него работает frame-ancestors.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://telegram.org" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  // Встраивать сайт можно только самому себе и веб-версиям Telegram (Mini App открывается там во фрейме)
  "frame-ancestors 'self' https://web.telegram.org https://*.web.telegram.org",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};
export default config;
