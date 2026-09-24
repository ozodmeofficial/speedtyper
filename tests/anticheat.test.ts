import { describe, expect, it } from "vitest";
import { boardFor, validateResult, type ResultPayload } from "@/lib/anticheat";

function base(over: Partial<ResultPayload> = {}): ResultPayload {
  // 60 s time test: 300 correct word chars + 60 correct spaces => 72 wpm
  const duration = 60;
  const chars = { correctWord: 300, correct: 305, incorrect: 5, extra: 0, missed: 0, spaces: 60, correctSpaces: 60 };
  const wpm = ((chars.correctWord + chars.correctSpaces) * (60 / duration)) / 5;
  const raw = ((chars.correct + chars.spaces + chars.incorrect) * (60 / duration)) / 5;
  return {
    mode: "time",
    mode2: "60",
    language: "english",
    punctuation: false,
    numbers: false,
    wpm,
    raw,
    acc: 98.5,
    consistency: 78,
    chars,
    duration,
    wpmHistory: Array.from({ length: 60 }, () => wpm),
    rawHistory: Array.from({ length: 60 }, () => raw),
    errorHistory: Array.from({ length: 60 }, () => 0),
    keySpacing: { count: 380, mean: 160, std: 55 },
    afkSeconds: 0,
    restarts: 2,
    incompleteTime: 4.5,
    ...over,
  };
}

describe("validateResult", () => {
  it("accepts a normal result and recomputes wpm", () => {
    const r = validateResult(base());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.wpm).toBe(72);
      expect(r.flagged).toBe(false);
    }
  });

  it("rejects a claimed wpm that does not match the char counts", () => {
    const r = validateResult(base({ wpm: 150 }));
    expect(r).toEqual({ ok: false, reason: "wpm_mismatch" });
  });

  it("rejects impossible speeds", () => {
    const chars = { correctWord: 1800, correct: 1800, incorrect: 0, extra: 0, missed: 0, spaces: 300, correctSpaces: 300 };
    const wpm = (2100 * 1) / 5;
    const r = validateResult(base({ chars, wpm, raw: wpm, keySpacing: { count: 2100, mean: 28, std: 20 } }));
    expect(r).toEqual({ ok: false, reason: "impossible_speed" });
  });

  it("rejects duration mismatch for time mode", () => {
    const r = validateResult(base({ duration: 45 }));
    expect(r.ok).toBe(false);
  });

  it("rejects robot-like uniform keystrokes", () => {
    const r = validateResult(base({ keySpacing: { count: 380, mean: 160, std: 1.2 } }));
    expect(r).toEqual({ ok: false, reason: "uniform_keystrokes" });
  });

  it("rejects results with too few keystrokes (paste)", () => {
    const r = validateResult(base({ keySpacing: { count: 20, mean: 160, std: 50 } }));
    expect(r).toEqual({ ok: false, reason: "keystrokes_missing" });
  });

  it("flags suspiciously low keystroke variance", () => {
    const r = validateResult(base({ keySpacing: { count: 380, mean: 160, std: 8 } }));
    expect(r.ok && r.flagged).toBe(true);
  });

  it("rejects malformed history", () => {
    expect(validateResult(base({ wpmHistory: [1, 2, 3] })).ok).toBe(false);
    expect(validateResult(base({ wpmHistory: "x" as unknown as number[] })).ok).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(validateResult(null).ok).toBe(false);
    expect(validateResult({ mode: "time" }).ok).toBe(false);
  });
});

describe("boardFor", () => {
  it("maps qualifying results to boards", () => {
    expect(boardFor({ mode: "time", mode2: "60", language: "uzbek", punctuation: false, numbers: false })).toBe("time_60_uzbek");
    expect(boardFor({ mode: "time", mode2: "30", language: "uzbek", punctuation: false, numbers: false })).toBeNull();
    expect(boardFor({ mode: "time", mode2: "15", language: "english", punctuation: true, numbers: false })).toBeNull();
    expect(boardFor({ mode: "words", mode2: "25", language: "english", punctuation: false, numbers: false })).toBeNull();
  });
});
