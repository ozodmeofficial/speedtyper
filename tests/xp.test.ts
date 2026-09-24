import { describe, expect, it } from "vitest";
import {
  effectiveStreak,
  levelForXp,
  levelProgress,
  MAX_LEVEL,
  nextSpeedRank,
  nextStreak,
  prevDayKey,
  raceXp,
  speedRankFor,
  testXp,
  tierForLevel,
  TIERS,
  xpForLevel,
} from "@/lib/xp";
import { ACHIEVEMENTS, newlyUnlocked, type AchStats } from "@/lib/achievements";

describe("testXp", () => {
  it("matches the documented examples", () => {
    expect(testXp({ duration: 30, wpm: 60, acc: 95 })).toBe(31);
    expect(testXp({ duration: 60, wpm: 80, acc: 97 })).toBe(69);
  });
  it("gives nothing for too short, inaccurate or broken tests", () => {
    expect(testXp({ duration: 2.9, wpm: 80, acc: 100 })).toBe(0);
    expect(testXp({ duration: 30, wpm: 80, acc: 49 })).toBe(0);
    expect(testXp({ duration: 30, wpm: 0, acc: 100 })).toBe(0);
    expect(testXp({ duration: NaN, wpm: 80, acc: 100 })).toBe(0);
  });
  it("grows with duration, speed and accuracy", () => {
    const base = testXp({ duration: 30, wpm: 60, acc: 95 });
    expect(testXp({ duration: 60, wpm: 60, acc: 95 })).toBeGreaterThan(base);
    expect(testXp({ duration: 30, wpm: 90, acc: 95 })).toBeGreaterThan(base);
    expect(testXp({ duration: 30, wpm: 60, acc: 99 })).toBeGreaterThan(base);
    expect(testXp({ duration: 30, wpm: 60, acc: 100 })).toBeGreaterThan(testXp({ duration: 30, wpm: 60, acc: 99.9 }));
  });
  it("caps duration and wpm", () => {
    expect(testXp({ duration: 3600, wpm: 60, acc: 95 })).toBe(testXp({ duration: 300, wpm: 60, acc: 95 }));
    expect(testXp({ duration: 60, wpm: 400, acc: 95 })).toBe(testXp({ duration: 60, wpm: 250, acc: 95 }));
  });
  it("is at least 1 for any valid test", () => {
    expect(testXp({ duration: 3, wpm: 1, acc: 50 })).toBe(Math.max(1, Math.round(5 + 0.5 * 3 * (1 + 1 / 60) * 0.25)));
  });
});

describe("raceXp", () => {
  const r = { wpm: 70, acc: 96, durationMs: 30_000 };
  it("is zero for unfinished races", () => {
    expect(raceXp({ ...r, place: null, players: 5 })).toBe(0);
  });
  it("rewards better places and bigger races", () => {
    const base = testXp({ duration: 30, wpm: 70, acc: 96 });
    expect(raceXp({ ...r, place: 1, players: 1 })).toBe(base);
    expect(raceXp({ ...r, place: 1, players: 2 })).toBe(base + 15 + 1 + 10);
    expect(raceXp({ ...r, place: 2, players: 2 })).toBe(base + 0 + 1);
    expect(raceXp({ ...r, place: 1, players: 20 })).toBeGreaterThan(raceXp({ ...r, place: 1, players: 2 }));
    expect(raceXp({ ...r, place: 3, players: 5 })).toBeLessThan(raceXp({ ...r, place: 1, players: 5 }));
  });
});

describe("levels", () => {
  it("follows T(L) = round(10(L-1)^2.3 + 40(L-1))", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(50);
    expect(xpForLevel(10)).toBe(1926);
    expect(xpForLevel(100)).toBe(392970);
    for (let l = 1; l <= MAX_LEVEL; l++) expect(xpForLevel(l)).toBe(Math.round(10 * Math.pow(l - 1, 2.3) + 40 * (l - 1)));
  });
  it("is strictly increasing with growing steps", () => {
    for (let l = 2; l < MAX_LEVEL; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
      expect(xpForLevel(l + 1) - xpForLevel(l)).toBeGreaterThanOrEqual(xpForLevel(l) - xpForLevel(l - 1));
    }
  });
  it("maps XP to levels at the boundaries", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-5)).toBe(1);
    expect(levelForXp(49)).toBe(1);
    expect(levelForXp(50)).toBe(2);
    for (let l = 1; l <= MAX_LEVEL; l++) {
      expect(levelForXp(xpForLevel(l))).toBe(l);
      if (l > 1) expect(levelForXp(xpForLevel(l) - 1)).toBe(l - 1);
    }
    expect(levelForXp(10_000_000)).toBe(MAX_LEVEL);
  });
  it("reports progress inside a level", () => {
    const p = levelProgress(100);
    expect(p).toMatchObject({ level: 2, into: 50, span: xpForLevel(3) - 50, toNext: xpForLevel(3) - 100, max: false });
    expect(p.frac).toBeCloseTo(50 / (xpForLevel(3) - 50));
    expect(levelProgress(0)).toMatchObject({ level: 1, into: 0, frac: 0 });
    expect(levelProgress(xpForLevel(100) + 5)).toMatchObject({ level: 100, max: true, frac: 1, toNext: 0 });
  });
});

describe("tiers and speed ranks", () => {
  it("assigns tiers by level", () => {
    expect(tierForLevel(1).id).toBe("novice");
    expect(tierForLevel(4).id).toBe("novice");
    expect(tierForLevel(5).id).toBe("amateur");
    expect(tierForLevel(15).id).toBe("swift");
    expect(tierForLevel(30).id).toBe("master");
    expect(tierForLevel(50).id).toBe("expert");
    expect(tierForLevel(70).id).toBe("champion");
    expect(tierForLevel(90).id).toBe("legend");
    expect(tierForLevel(100).id).toBe("legend");
    expect(TIERS.map((t) => t.from)).toEqual([...TIERS.map((t) => t.from)].sort((a, b) => a - b));
  });
  it("assigns speed ranks from best 60 s wpm", () => {
    expect(speedRankFor(null)).toBeNull();
    expect(speedRankFor(0)).toBeNull();
    expect(speedRankFor(25)?.id).toBe("bronze");
    expect(speedRankFor(40)?.id).toBe("silver");
    expect(speedRankFor(59.9)?.id).toBe("silver");
    expect(speedRankFor(60)?.id).toBe("gold");
    expect(speedRankFor(85)?.id).toBe("platinum");
    expect(speedRankFor(140)?.id).toBe("diamond");
    expect(nextSpeedRank(55)).toEqual({ rank: expect.objectContaining({ id: "gold" }), need: 5 });
    expect(nextSpeedRank(120)).toBeNull();
  });
});

describe("daily streak", () => {
  it("computes the previous Tashkent day across month and year borders", () => {
    expect(prevDayKey(20260924)).toBe(20260923);
    expect(prevDayKey(20260301)).toBe(20260228);
    expect(prevDayKey(20240301)).toBe(20240229);
    expect(prevDayKey(20260101)).toBe(20251231);
  });
  it("starts, continues, keeps and resets", () => {
    let s = nextStreak({ current: 0, best: 0, lastDay: null }, 20260922);
    expect(s).toEqual({ current: 1, best: 1, lastDay: 20260922 });
    s = nextStreak(s, 20260922);
    expect(s).toEqual({ current: 1, best: 1, lastDay: 20260922 });
    s = nextStreak(s, 20260923);
    s = nextStreak(s, 20260924);
    expect(s).toEqual({ current: 3, best: 3, lastDay: 20260924 });
    s = nextStreak(s, 20260927);
    expect(s).toEqual({ current: 1, best: 3, lastDay: 20260927 });
  });
  it("shows a streak until the day after the last test", () => {
    const s = { current: 5, best: 9, lastDay: 20260923 };
    expect(effectiveStreak(s, 20260923)).toBe(5);
    expect(effectiveStreak(s, 20260924)).toBe(5);
    expect(effectiveStreak(s, 20260925)).toBe(0);
    expect(effectiveStreak({ current: 0, best: 0, lastDay: null }, 20260925)).toBe(0);
  });
});

describe("achievements", () => {
  const zero: AchStats = { testsCompleted: 0, bestWpm: 0, perfect60: false, streakBest: 0, racesFinished: 0, raceWins: 0, level: 1, timeTyping: 0 };
  it("has unique ids", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
  it("unlocks nothing for a fresh account", () => {
    expect(newlyUnlocked(zero, [])).toEqual([]);
  });
  it("unlocks by thresholds", () => {
    expect(newlyUnlocked({ ...zero, testsCompleted: 1 }, [])).toEqual(["first_test"]);
    expect(newlyUnlocked({ ...zero, testsCompleted: 1000 }, [])).toEqual(["first_test", "tests_100", "tests_1000"]);
    expect(newlyUnlocked({ ...zero, bestWpm: 100 }, [])).toEqual(["wpm_60", "wpm_100"]);
    expect(newlyUnlocked({ ...zero, perfect60: true }, [])).toEqual(["perfect_60"]);
    expect(newlyUnlocked({ ...zero, streakBest: 7 }, [])).toEqual(["streak_7"]);
    expect(newlyUnlocked({ ...zero, raceWins: 10, racesFinished: 12 }, [])).toEqual(["race_first", "race_wins_10"]);
    expect(newlyUnlocked({ ...zero, level: 50 }, [])).toEqual(["level_10", "level_50"]);
    expect(newlyUnlocked({ ...zero, timeTyping: 36_000 }, [])).toEqual(["hours_10"]);
  });
  it("skips what is already owned", () => {
    expect(newlyUnlocked({ ...zero, testsCompleted: 150 }, ["first_test"])).toEqual(["tests_100"]);
  });
});
