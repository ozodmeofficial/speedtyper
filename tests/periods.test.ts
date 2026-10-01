import { describe, expect, it } from "vitest";
import { periodDayRange, periodKey, periodStart } from "@/lib/periods";

// 2026-10-01 20:30 UTC = 2026-10-02 01:30 in Tashkent (UTC+5)
const now = Date.UTC(2026, 9, 1, 20, 30);

describe("periods (Asia/Tashkent)", () => {
  it("day/month/year ranges follow the Tashkent calendar", () => {
    expect(periodDayRange("day", now)).toEqual({ from: 20261002, to: 20261002 });
    expect(periodDayRange("month", now)).toEqual({ from: 20261000, to: 20261099 });
    expect(periodDayRange("year", now)).toEqual({ from: 20260000, to: 20269999 });
    expect(periodDayRange("all", now)).toBeNull();
  });

  it("period starts are Tashkent midnights in UTC", () => {
    expect(periodStart("day", now)?.toISOString()).toBe("2026-10-01T19:00:00.000Z");
    expect(periodStart("month", now)?.toISOString()).toBe("2026-09-30T19:00:00.000Z");
    expect(periodStart("year", now)?.toISOString()).toBe("2025-12-31T19:00:00.000Z");
    expect(periodStart("all", now)).toBeNull();
  });

  it("cache keys roll over with the period", () => {
    expect(periodKey("day", now)).toBe("day20261002");
    expect(periodKey("month", now)).toBe("month20261000");
    expect(periodKey("all", now)).toBe("all");
  });
});
