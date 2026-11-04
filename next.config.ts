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
      // Личные разделы не индексируются поисковиками
      source: "/:dir(admin|account|deposit|api)/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }, {
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        // Адрес страницы не уходит на другие сайты (ни путь, ни параметры)
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), browsing-topics=(), interest-cohort=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        { key: "X-DNS-Prefetch-Control", value: "off" },
        { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      ],
    }];
  },
};
export default config;
