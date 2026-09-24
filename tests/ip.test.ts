import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/ip";

describe("clientIp", () => {
  it("ignores forwarding headers from untrusted peers", () => {
    expect(clientIp("203.0.113.9", { "x-forwarded-for": "1.2.3.4", "cf-connecting-ip": "5.6.7.8" })).toBe("203.0.113.9");
  });
  it("walks X-Forwarded-For right-to-left through trusted proxies", () => {
    expect(clientIp("172.18.0.2", { "x-forwarded-for": "9.9.9.9, 198.51.100.7, 10.0.0.5" })).toBe("198.51.100.7");
  });
  it("uses CF-Connecting-IP only when the hop before Traefik is Cloudflare", () => {
    expect(clientIp("172.18.0.2", { "x-forwarded-for": "162.158.1.1", "cf-connecting-ip": "84.54.70.1" })).toBe("84.54.70.1");
    expect(clientIp("172.18.0.2", { "x-forwarded-for": "198.51.100.7", "cf-connecting-ip": "84.54.70.1" })).toBe("198.51.100.7");
  });
  it("handles ipv4-mapped ipv6 peers", () => {
    expect(clientIp("::ffff:172.18.0.2", { "x-forwarded-for": "198.51.100.7" })).toBe("198.51.100.7");
  });
});
