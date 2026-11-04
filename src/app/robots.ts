import type { MetadataRoute } from "next";

// Поисковикам закрыты личные разделы, админка и API
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/deposit", "/api/", "/reset-password"] }] };
}
