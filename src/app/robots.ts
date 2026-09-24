import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "https://speedtyper.uz";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/login"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
