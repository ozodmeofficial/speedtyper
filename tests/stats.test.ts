import { describe, expect, it } from "vitest";
import { calcAccuracy, calcConsistency, calcRaw, calcWpm, countChars, kogasa, rawPerSecond, stdDev } from "@/lib/typing/stats";
import { TypingEngine, normalizeChar } from "@/lib/typing/engine";

function typeAll(e: TypingEngine, text: string, start = 1000, stepMs = 100) {
  let t = start;
  let finished = false;
  for (const ch of text) {
    finished = e.insert(ch, t) || finished;
    t += stepMs;
  }
  return { t, finished };
}

describe("countChars", () => {
  it("counts a perfect run", () => {
    const c = countChars(["hello", "world"], ["hello", "world"], false);
    expect(c).toMatchObject({ correctWordChars: 10, correctChars: 10, incorrectChars: 0, extraChars: 0, missedChars: 0, spaces: 1, correctSpaces: 1 });
  });

  it("counts incorrect, extra and missed letters", () => {
    const c = countChars(["abc", "def", "ghi"], ["abx", "defgh", "g"], false);
    expect(c.correctWordChars).toBe(0);
    expect(c.correctChars).toBe(2 + 3 + 1);
    expect(c.incorrectChars).toBe(1);
    expect(c.extraChars).toBe(2);
    expect(c.missedChars).toBe(2);
    expect(c.spaces).toBe(2);
    expect(c.correctSpaces).toBe(0);
  });

  it("treats a correct partial last word as correct in time mode", () => {
    const c = countChars(["abc", "defg"], ["abc", "de"], true);
    expect(c.correctWordChars).toBe(5);
    expect(c.missedChars).toBe(0);
    expect(c.correctSpaces).toBe(1);
  });

  it("does not credit a wrong partial last word", () => {
    const c = countChars(["abc", "defg"], ["abc", "dx"], true);
    expect(c.correctWordChars).toBe(3);
    expect(c.incorrectChars).toBe(1);
  });
});

describe("wpm / raw / accuracy", () => {
  it("computes net wpm from correct word chars + correct spaces", () => {
    // 50 correct chars + 10 spaces in 12 seconds => 60 chars/12s = 300 cpm => 60 wpm
    expect(calcWpm({ correctWordChars: 50, correctSpaces: 10 }, 12)).toBe(60);
  });
  it("computes raw with all typed chars", () => {
    expect(calcRaw({ correctChars: 40, spaces: 10, incorrectChars: 5, extraChars: 5 }, 12)).toBe(60);
  });
  it("returns 0 for zero duration", () => {
    expect(calcWpm({ correctWordChars: 10, correctSpaces: 1 }, 0)).toBe(0);
  });
  it("accuracy from keypresses", () => {
    expect(calcAccuracy(95, 5)).toBe(95);
    expect(calcAccuracy(0, 0)).toBe(100);
    expect(calcAccuracy(2, 1)).toBe(66.67);
  });
});

describe("consistency", () => {
  it("is 100 for perfectly steady speed", () => {
    expect(calcConsistency([80, 80, 80, 80])).toBe(100);
  });
  it("drops with variance and matches kogasa(cov)", () => {
    const v = [60, 100, 40, 120];
    const cov = stdDev(v) / 80;
    expect(calcConsistency(v)).toBeCloseTo(kogasa(cov), 1);
    expect(calcConsistency(v)).toBeLessThan(80);
  });
  it("handles empty and zero input", () => {
    expect(calcConsistency([])).toBe(0);
    expect(calcConsistency([0, 0])).toBe(0);
  });
  it("scales a partial last second", () => {
    expect(rawPerSecond([5, 5, 2], 2.5)).toEqual([60, 60, 48]);
  });
});

describe("TypingEngine", () => {
  it("finishes a words test when the last word is typed correctly", () => {
    const e = new TypingEngine(["the", "cat"], { mode: "words" });
    const { finished } = typeAll(e, "the cat");
    expect(finished).toBe(true);
    const r = e.result();
    expect(r.counts.correctWordChars).toBe(6);
    expect(r.counts.correctSpaces).toBe(1);
    expect(r.acc).toBe(100);
    // 7 chars in 0.6s
    expect(r.duration).toBeCloseTo(0.6, 2);
    expect(r.wpm).toBe(calcWpm(r.counts, r.duration));
  });

  it("allows backspace into a previous word only when it had errors", () => {
    const e = new TypingEngine(["ab", "cd", "ef"], { mode: "words" });
    typeAll(e, "ab ");
    expect(e.backspace(2000)).toBe(false); // previous word correct
    typeAll(e, "cx ", 3000);
    expect(e.index).toBe(2);
    expect(e.backspace(4000)).toBe(true); // previous word wrong
    expect(e.index).toBe(1);
    expect(e.current).toBe("cx");
  });

  it("freedom mode allows going back into correct words", () => {
    const e = new TypingEngine(["ab", "cd"], { mode: "words", freedom: true });
    typeAll(e, "ab ");
    expect(e.backspace(2000)).toBe(true);
    expect(e.index).toBe(0);
  });

  it("confidence max blocks all backspace", () => {
    const e = new TypingEngine(["ab", "cd"], { mode: "words", confidence: "max" });
    typeAll(e, "a");
    expect(e.backspace(2000)).toBe(false);
  });

  it("counts extra letters and keypress accuracy", () => {
    const e = new TypingEngine(["ab", "cd"], { mode: "words" });
    typeAll(e, "abx cd");
    const r = e.result();
    expect(r.counts.extraChars).toBe(1);
    expect(r.incorrectKeys).toBe(2); // extra letter + space on wrong word
    expect(r.missedWords).toEqual(["ab"]);
  });

  it("ends a time test on tick and records per-second history", () => {
    const e = new TypingEngine(["aaaa", "bbbb", "cccc", "dddd", "eeee", "ffff"], { mode: "time", timeLimit: 2 });
    typeAll(e, "aaaa bbbb cccc", 0, 120);
    expect(e.tick(1)).toBe(false);
    expect(e.tick(2)).toBe(true);
    const r = e.result();
    expect(r.duration).toBe(2);
    expect(r.wpmHistory.length).toBe(2);
    expect(r.rawHistory.length).toBe(2);
  });

  it("maps keyboard apostrophes to the expected typographic one", () => {
    expect(normalizeChar("'", "‘")).toBe("‘");
    const e = new TypingEngine(["o‘qish"], { mode: "words" });
    const { finished } = typeAll(e, "o'qish");
    expect(finished).toBe(true);
    expect(e.result().acc).toBe(100);
  });

  it("zen mode treats everything as correct", () => {
    const e = new TypingEngine([], { mode: "zen" });
    typeAll(e, "hello there");
    e.finish(5000);
    const r = e.result();
    expect(r.counts.incorrectChars).toBe(0);
    expect(r.wordsTyped).toBe(2);
  });
});
