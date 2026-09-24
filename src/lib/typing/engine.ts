import {
  calcAccuracy,
  calcConsistency,
  calcRaw,
  calcWpm,
  countChars,
  round2,
  spacingStats,
  type CharCounts,
  type KeySpacingStats,
} from "./stats";

export type TestMode = "time" | "words" | "quote" | "zen" | "custom";
export type Confidence = "off" | "on" | "max";

export interface EngineOptions {
  mode: TestMode;
  /** seconds, time mode only */
  timeLimit?: number;
  freedom?: boolean;
  confidence?: Confidence;
  /** supplies more words for endless (time) mode */
  moreWords?: (count: number, last: string | undefined) => string[];
}

export interface EngineResult {
  wpm: number;
  raw: number;
  acc: number;
  consistency: number;
  counts: CharCounts;
  duration: number;
  wpmHistory: number[];
  rawHistory: number[];
  errorHistory: number[];
  keySpacing: KeySpacingStats;
  afkSeconds: number;
  missedWords: string[];
  correctKeys: number;
  incorrectKeys: number;
  wordsTyped: number;
}

const APOSTROPHES = new Set(["'", "`", "‘", "’", "ʻ", "ʼ", "´"]);
const DOUBLE_QUOTES = new Set(['"', "“", "”", "«", "»", "„"]);
const DASHES = new Set(["-", "–", "—"]);

/** Map an input char onto the expected one when they are keyboard-equivalent. */
export function normalizeChar(typed: string, expected: string | undefined): string {
  if (expected === undefined || typed === expected) return typed;
  if (APOSTROPHES.has(typed) && APOSTROPHES.has(expected)) return expected;
  if (DOUBLE_QUOTES.has(typed) && DOUBLE_QUOTES.has(expected)) return expected;
  if (DASHES.has(typed) && DASHES.has(expected)) return expected;
  if (typed === "е" && expected === "ё") return expected;
  return typed;
}

const MAX_EXTRA = 20;

export class TypingEngine {
  readonly mode: TestMode;
  readonly timeLimit: number;
  freedom: boolean;
  confidence: Confidence;
  private moreWords?: (count: number, last: string | undefined) => string[];

  words: string[];
  inputs: string[] = [];
  current = "";
  index = 0;
  /** lowest word index backspace may return to (hidden lines) */
  minIndex = 0;

  startedAt = 0;
  lastKeyAt = 0;
  finishedAt = 0;
  finished = false;

  correctKeys = 0;
  incorrectKeys = 0;
  private buckets: number[] = [];
  private errorBuckets: number[] = [];
  wpmHistory: number[] = [];
  rawHistory: number[] = [];
  errorHistory: number[] = [];
  private intervals: number[] = [];
  private currentHadError = false;
  private missed = new Set<string>();
  /** incremented on every state change, handy for React */
  version = 0;

  constructor(words: string[], opts: EngineOptions) {
    this.mode = opts.mode;
    this.timeLimit = opts.timeLimit ?? 0;
    this.freedom = opts.freedom ?? false;
    this.confidence = opts.confidence ?? "off";
    this.moreWords = opts.moreWords;
    this.words = opts.mode === "zen" ? [""] : words.slice();
  }

  get started() {
    return this.startedAt > 0;
  }

  get target(): string {
    return this.words[this.index] ?? "";
  }

  elapsed(now: number): number {
    if (!this.started) return 0;
    const end = this.finished ? this.finishedAt : now;
    return Math.max(0, (end - this.startedAt) / 1000);
  }

  private begin(now: number) {
    if (!this.started) {
      this.startedAt = now;
      this.lastKeyAt = now;
    }
  }

  private recordKey(now: number, correct: boolean) {
    const b = Math.floor((now - this.startedAt) / 1000);
    while (this.buckets.length <= b) {
      this.buckets.push(0);
      this.errorBuckets.push(0);
    }
    this.buckets[b]++;
    if (correct) this.correctKeys++;
    else {
      this.incorrectKeys++;
      this.errorBuckets[b]++;
    }
    const gap = now - this.lastKeyAt;
    if (gap > 0 && this.intervals.length < 20000) this.intervals.push(round2(gap));
    this.lastKeyAt = now;
  }

  private ensureWords() {
    if (this.mode === "time" && this.moreWords && this.index > this.words.length - 60) {
      this.words.push(...this.moreWords(100, this.words[this.words.length - 1]));
    }
  }

  /** Type one character. Returns true when the test just finished. */
  insert(rawCh: string, now: number): boolean {
    if (this.finished) return false;
    if (rawCh === " ") return this.space(now);
    this.begin(now);
    const target = this.target;
    if (this.mode === "zen") {
      if (this.current.length >= 50) return false;
      this.current += rawCh;
      this.words[this.index] = this.current;
      this.recordKey(now, true);
      this.version++;
      return false;
    }
    if (this.current.length >= target.length + MAX_EXTRA) return false;
    const ch = normalizeChar(rawCh, target[this.current.length]);
    const correct = this.current.length < target.length && target[this.current.length] === ch;
    this.current += ch;
    if (!correct) this.currentHadError = true;
    this.recordKey(now, correct);
    this.version++;
    const isLastWord = this.index === this.words.length - 1;
    if (isLastWord && this.mode !== "time" && this.current === target) {
      this.commit();
      this.finish(now);
      return true;
    }
    return false;
  }

  private commit() {
    const target = this.target;
    if (this.mode !== "zen" && (this.current !== target || this.currentHadError)) this.missed.add(target);
    this.inputs.push(this.current);
    this.current = "";
    this.currentHadError = false;
    this.index++;
    if (this.mode === "zen") this.words[this.index] = "";
    this.ensureWords();
  }

  space(now: number): boolean {
    if (this.finished) return false;
    if (this.current.length === 0) return false;
    this.begin(now);
    const correct = this.mode === "zen" || this.current === this.target;
    this.recordKey(now, correct);
    const isLastWord = this.index === this.words.length - 1;
    this.commit();
    this.version++;
    if (isLastWord && this.mode !== "time" && this.mode !== "zen") {
      this.finish(now);
      return true;
    }
    return false;
  }

  /** Backspace; `word` = ctrl/alt+backspace. Returns true if anything changed. */
  backspace(now: number, word = false): boolean {
    if (this.finished || !this.started) return false;
    if (this.confidence === "max") return false;
    if (this.current.length > 0) {
      this.current = word ? "" : this.current.slice(0, -1);
      if (this.mode === "zen") this.words[this.index] = this.current;
      this.lastKeyAt = now;
      this.version++;
      return true;
    }
    if (this.index === 0 || this.index - 1 < this.minIndex) return false;
    if (this.confidence === "on") return false;
    const prev = this.index - 1;
    const prevInput = this.inputs[prev];
    const allowed = this.mode === "zen" || this.freedom || prevInput !== this.words[prev];
    if (!allowed) return false;
    if (this.mode === "zen") this.words.pop();
    this.index = prev;
    this.inputs.pop();
    this.current = word ? "" : prevInput;
    if (this.mode === "zen") this.words[this.index] = this.current;
    this.currentHadError = this.missed.has(this.words[prev] ?? "");
    this.lastKeyAt = now;
    this.version++;
    return true;
  }

  /** Current char counts (live). */
  counts(partial = true): CharCounts {
    const inputs = this.current.length > 0 || !this.finished ? [...this.inputs, this.current] : this.inputs;
    const targets = this.mode === "zen" ? inputs : this.words;
    return countChars(targets, inputs, partial);
  }

  liveWpm(now: number): number {
    const t = this.elapsed(now);
    if (t < 0.5) return 0;
    return calcWpm(this.counts(true), t);
  }

  liveAcc(): number {
    return calcAccuracy(this.correctKeys, this.incorrectKeys);
  }

  /**
   * Called once per elapsed second (s = 1, 2, ...). Records chart samples.
   * Returns true when a time-mode test just ended.
   */
  tick(second: number): boolean {
    if (!this.started || this.finished) return false;
    while (this.wpmHistory.length < second) {
      const i = this.wpmHistory.length;
      const counts = this.counts(true);
      this.wpmHistory.push(Math.max(0, calcWpm(counts, i + 1)));
      this.rawHistory.push(round2(((this.buckets[i] ?? 0) * 60) / 5));
      this.errorHistory.push(this.errorBuckets[i] ?? 0);
    }
    if (this.mode === "time" && this.timeLimit > 0 && second >= this.timeLimit) {
      this.finish(this.startedAt + this.timeLimit * 1000);
      return true;
    }
    return false;
  }

  finish(now: number) {
    if (this.finished) return;
    if (this.mode === "zen" && this.current.length > 0) {
      this.inputs.push(this.current);
      this.index++;
      this.current = "";
    }
    this.finished = true;
    this.finishedAt = Math.max(now, this.startedAt + 1);
    this.version++;
  }

  result(): EngineResult {
    const duration = round2(
      this.mode === "time" && this.timeLimit > 0
        ? Math.min(this.elapsed(this.finishedAt), this.timeLimit)
        : this.elapsed(this.finishedAt),
    );
    const partial = this.mode === "time";
    const inputs = this.current.length > 0 ? [...this.inputs, this.current] : this.inputs.slice();
    const targets = this.mode === "zen" ? inputs : this.words;
    const counts = countChars(targets, inputs, partial);
    // In words/quote mode the final word is committed without a trailing space,
    // countChars treats the last input as "last" so no space is counted for it.
    const wpm = calcWpm(counts, duration);
    const raw = calcRaw(counts, duration);

    // final partial second for the chart
    const wpmHistory = this.wpmHistory.slice();
    const rawHistory = this.rawHistory.slice();
    const errorHistory = this.errorHistory.slice();
    const full = Math.floor(duration);
    for (let i = wpmHistory.length; i < full; i++) {
      wpmHistory.push(calcWpm(counts, i + 1));
      rawHistory.push(round2(((this.buckets[i] ?? 0) * 60) / 5));
      errorHistory.push(this.errorBuckets[i] ?? 0);
    }
    const rest = duration - full;
    if (rest >= 0.25 && this.buckets.length > full) {
      wpmHistory.push(wpm);
      rawHistory.push(round2(((this.buckets[full] ?? 0) * 60) / 5 / Math.max(rest, 0.5)));
      errorHistory.push(this.errorBuckets[full] ?? 0);
    }
    if (wpmHistory.length > 0) wpmHistory[wpmHistory.length - 1] = wpm;

    let afk = 0;
    for (let i = 0; i < Math.ceil(duration); i++) if ((this.buckets[i] ?? 0) === 0) afk++;

    return {
      wpm,
      raw,
      acc: this.liveAcc(),
      consistency: calcConsistency(rawHistory),
      counts,
      duration,
      wpmHistory,
      rawHistory,
      errorHistory,
      keySpacing: spacingStats(this.intervals),
      afkSeconds: afk,
      missedWords: [...this.missed],
      correctKeys: this.correctKeys,
      incorrectKeys: this.incorrectKeys,
      wordsTyped: this.inputs.length,
    };
  }
}
