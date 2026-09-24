import { isIP } from "node:net";

/** Cloudflare edge ranges (https://www.cloudflare.com/ips/). */
const CLOUDFLARE = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
  "2a06:98c0::/29", "2c0f:f248::/32",
];

const PRIVATE = ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "::1/128", "fc00::/7", "fe80::/10"];

type Cidr = { v: 4 | 6; net: bigint; bits: number };

function toBig(ip: string): { v: 4 | 6; n: bigint } | null {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ip.split(".").reduce((a, p) => (a << 8n) + BigInt(Number(p)), 0n);
    return { v: 4, n };
  }
  if (kind === 6) {
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return toBig(mapped[1]);
    const [head, tail] = ip.split("::");
    const h = head ? head.split(":") : [];
    const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
    const parts = tail !== undefined ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
    const n = parts.reduce((a, p) => (a << 16n) + BigInt(parseInt(p || "0", 16)), 0n);
    return { v: 6, n };
  }
  return null;
}

function parseCidr(c: string): Cidr | null {
  const [ip, b] = c.split("/");
  const x = toBig(ip);
  if (!x) return null;
  const width = x.v === 4 ? 32 : 128;
  const bits = b === undefined ? width : Number(b);
  const shift = BigInt(width - bits);
  return { v: x.v, net: (x.n >> shift) << shift, bits };
}

function inList(ip: string, list: Cidr[]): boolean {
  const x = toBig(ip);
  if (!x) return false;
  for (const c of list) {
    if (c.v !== x.v) continue;
    const width = c.v === 4 ? 32 : 128;
    const shift = BigInt(width - c.bits);
    if ((x.n >> shift) << shift === c.net) return true;
  }
  return false;
}

const trustedProxies = (process.env.TRUSTED_PROXIES ?? PRIVATE.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(parseCidr)
  .filter((x): x is Cidr => x !== null);
const cloudflare = CLOUDFLARE.map(parseCidr).filter((x): x is Cidr => x !== null);
const trustCloudflare = process.env.TRUST_CLOUDFLARE !== "false";

const clean = (s: string) => s.trim().replace(/^\[|\]$/g, "").replace(/^::ffff:(?=\d+\.)/i, "");

/**
 * Resolve the real client IP. Forwarding headers are only honoured when the
 * TCP peer is a trusted proxy (Traefik on the docker network); the chain is
 * walked right-to-left skipping trusted hops, and CF-Connecting-IP is used
 * only when the hop in front of our proxy is a Cloudflare edge address.
 */
export function clientIp(remote: string | undefined, headers: Record<string, string | string[] | undefined>): string {
  const peer = clean(remote ?? "");
  if (!peer || !inList(peer, trustedProxies)) return peer || "unknown";
  const xffRaw = headers["x-forwarded-for"];
  const xff = (Array.isArray(xffRaw) ? xffRaw.join(",") : xffRaw ?? "")
    .split(",")
    .map(clean)
    .filter((s) => isIP(s) !== 0);
  const chain = [...xff, peer];
  let i = chain.length - 1;
  while (i > 0 && inList(chain[i], trustedProxies)) i--;
  const candidate = chain[i];
  if (trustCloudflare && inList(candidate, cloudflare)) {
    const cf = headers["cf-connecting-ip"];
    const cfIp = clean(Array.isArray(cf) ? cf[0] : cf ?? "");
    if (isIP(cfIp)) return cfIp;
    if (i > 0) return chain[i - 1];
  }
  return candidate;
}

export const CLIENT_IP_HEADER = "x-st-client-ip";
