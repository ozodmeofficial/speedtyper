import { TypingEngine, type TestMode } from "@/lib/typing/engine";
import {
  endsSentence,
  generateWords,
  languageInfo,
  pickQuote,
  splitQuote,
  type LanguageId,
  type Quote,
  type QuoteLength,
} from "@/lib/typing/words";
import { mode2Of, type Settings } from "@/lib/settings";

export interface QuoteMeta {
  id: number;
  author: string;
  source: string;
  length: number;
}

export interface InitialTest {
  signature: string;
  words: string[];
  quote: QuoteMeta | null;
}

export interface TestSpec {
  id: number;
  mode: TestMode;
  mode2: string;
  language: LanguageId;
  punctuation: boolean;
  numbers: boolean;
  words: string[];
  quote: QuoteMeta | null;
  practice: boolean;
  timeLimit: number;
}

export function testSignature(s: Pick<Settings, "mode" | "time" | "words" | "quoteLength" | "punctuation" | "numbers" | "language">): string {
  return [s.mode, s.time, s.words, s.quoteLength, s.punctuation ? 1 : 0, s.numbers ? 1 : 0, s.language].join("|");
}

export const TIME_BATCH = 100;

/** Words for a new test. Returns null when the list for the language is not loaded yet. */
export function buildTestWords(
  s: Settings,
  list: readonly string[] | null,
  quotes: readonly Quote[] | null,
  customText: string,
  prevQuoteId?: number,
): { words: string[]; quote: QuoteMeta | null } | null {
  const punct = s.punctuation && (s.mode === "time" || s.mode === "words");
  const nums = s.numbers && (s.mode === "time" || s.mode === "words");
  switch (s.mode) {
    case "time":
      if (!list) return null;
      return { words: generateWords(list, TIME_BATCH, { punctuation: punct, numbers: nums, endSentence: false }), quote: null };
    case "words":
      if (!list) return null;
      return { words: generateWords(list, s.words, { punctuation: punct, numbers: nums }), quote: null };
    case "quote": {
      if (!quotes || quotes.length === 0) return null;
      const q = pickQuote(quotes, s.quoteLength as QuoteLength, Math.random, prevQuoteId);
      return { words: splitQuote(q.text), quote: { id: q.id, author: q.author, source: q.source, length: q.length } };
    }
    case "custom": {
      const words = customText.split(/\s+/).filter(Boolean).slice(0, 2000);
      return { words, quote: null };
    }
    case "zen":
      return { words: [], quote: null };
  }
}

export function quoteLanguageOf(lang: LanguageId) {
  return languageInfo(lang).quotes;
}

export function makeSpec(id: number, s: Settings, words: string[], quote: QuoteMeta | null, practice = false): TestSpec {
  return {
    id,
    mode: practice ? "custom" : s.mode,
    mode2: practice ? "custom" : mode2Of(s),
    language: s.language,
    punctuation: s.punctuation && (s.mode === "time" || s.mode === "words") && !practice,
    numbers: s.numbers && (s.mode === "time" || s.mode === "words") && !practice,
    words,
    quote,
    practice,
    timeLimit: s.mode === "time" && !practice ? s.time : 0,
  };
}

export function makeEngine(spec: TestSpec, s: Settings, getList: () => readonly string[] | null): TypingEngine {
  return new TypingEngine(spec.words, {
    mode: spec.mode,
    timeLimit: spec.timeLimit,
    freedom: s.freedomMode,
    confidence: s.confidenceMode,
    moreWords:
      spec.mode === "time"
        ? (n, prev) => {
            const list = getList();
            if (!list) return [];
            return generateWords(list, n, {
              punctuation: spec.punctuation,
              numbers: spec.numbers,
              endSentence: false,
              previous: prev,
              sentenceStart: endsSentence(prev),
            });
          }
        : undefined,
  });
}

export function practiceWords(missed: readonly string[]): string[] {
  if (missed.length === 0) return [];
  const out: string[] = [];
  const target = Math.max(20, Math.min(100, missed.length * 3));
  while (out.length < target) out.push(...missed);
  const arr = out.slice(0, target);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // avoid immediate duplicates when possible
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === arr[i - 1]) {
      const k = arr.findIndex((w, idx) => idx > i && w !== arr[i]);
      if (k > 0) [arr[i], arr[k]] = [arr[k], arr[i]];
    }
  }
  return arr;
}
