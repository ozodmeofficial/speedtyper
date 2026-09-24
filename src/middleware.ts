import { NextResponse, type NextRequest } from "next/server";

const CSRF_COOKIE = "st_csrf";

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function nonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function middleware(req: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const secure = (process.env.APP_URL ?? "").startsWith("https://");

  let res: NextResponse;
  if (isApi) {
    res = NextResponse.next();
  } else {
    const n = nonce();
    const host = req.headers.get("host") ?? "";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${n}' https://static.cloudflareinsights.com${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ws://${host} wss://${host} https://cloudflareinsights.com`,
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "media-src 'self' data: blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(secure ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
    const headers = new Headers(req.headers);
    headers.set("x-nonce", n);
    headers.set("content-security-policy", csp);
    res = NextResponse.next({ request: { headers } });
    res.headers.set("content-security-policy", csp);
  }

  if (!req.cookies.get(CSRF_COOKIE)) {
    res.cookies.set(CSRF_COOKIE, randomToken(), { httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|opengraph-image|fonts/).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
