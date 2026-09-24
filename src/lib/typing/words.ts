export type LanguageId = "english" | "english_1k" | "uzbek" | "russian";
export type QuoteLanguage = "english" | "uzbek" | "russian";
export type QuoteLength = "all" | "short" | "medium" | "long";

export interface LanguageInfo {
  id: LanguageId;
  label: string;
  quotes: QuoteLanguage;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { id: "english", label: "English", quotes: "english" },
  { id: "english_1k", label: "English 1k", quotes: "english" },
  { id: "uzbek", label: "O‘zbekcha", quotes: "uzbek" },
  { id: "russian", label: "Русский", quotes: "russian" },
];

export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id);

export function isLanguage(v: unknown): v is LanguageId {
  return typeof v === "string" && (LANGUAGE_IDS as readonly string[]).includes(v);
}

export function languageInfo(id: string): LanguageInfo {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
}

export interface Wordlist {
  name: string;
  words: string[];
}

export interface Quote {
  id: number;
  text: string;
  source: string;
  author: string;
  length: number;
}

export interface QuoteList {
  language: string;
  quotes: Quote[];
}

export function quoteLengthGroup(len: number): Exclude<QuoteLength, "all"> {
  if (len <= 120) return "short";
  if (len <= 300) return "medium";
  return "long";
}

export type Rng = () => number;

/** Small fast seeded PRNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];

function capitalize(w: string): string {
  if (!w) return w;
  return w[0].toLocaleUpperCase() + w.slice(1);
}

export interface GenerateOptions {
  punctuation?: boolean;
  numbers?: boolean;
  rng?: Rng;
  /** previous word, to avoid immediate repeats across batches */
  previous?: string;
  /** whether the first generated word starts a sentence */
  sentenceStart?: boolean;
  /** end the batch with a sentence terminator (default true) */
  endSentence?: boolean;
}

/**
 * Generate `count` random words from a list, optionally with punctuation and
 * numbers sprinkled in (sentence case, commas, periods, quotes, brackets...).
 */
export function generateWords(list: readonly string[], count: number, opts: GenerateOptions = {}): string[] {
  const rng = opts.rng ?? Math.random;
  const out: string[] = [];
  let prev = opts.previous ?? "";
  let prev2 = "";
  let sentenceStart = opts.sentenceStart ?? true;
  for (let i = 0; i < count; i++) {
    let w = pick(list, rng);
    let guard = 0;
    while ((w === prev || w === prev2) && list.length > 2 && guard++ < 8) w = pick(list, rng);
    prev2 = prev;
    prev = w;

    if (opts.numbers && rng() < 0.1) {
      const digits = 1 + Math.floor(rng() * 4);
      w = String(Math.floor(rng() * Math.pow(10, digits)));
    }

    if (opts.punctuation) {
      const isLast = i === count - 1 && opts.endSentence !== false;
      if (sentenceStart) w = capitalize(w);
      sentenceStart = false;
      const r = rng();
      if (isLast || r < 0.1) {
        const e = rng();
        w += e < 0.75 ? "." : e < 0.88 ? "?" : "!";
        sentenceStart = true;
      } else if (r < 0.2) {
        w += ",";
      } else if (r < 0.23) {
        w = `"${w}"`;
      } else if (r < 0.25) {
        w = `(${w})`;
      } else if (r < 0.27) {
        w += ":";
      } else if (r < 0.28) {
        w += ";";
      } else if (r < 0.3 && i < count - 2) {
        out.push(w);
        w = "-";
        i++;
      }
    }
    out.push(w);
  }
  return out;
}

export function splitQuote(text: string): string[] {
  return text.split(" ").filter((w) => w.length > 0);
}

export function pickQuote(list: readonly Quote[], length: QuoteLength, rng: Rng = Math.random, excludeId?: number): Quote {
  let pool = length === "all" ? list : list.filter((q) => quoteLengthGroup(q.length) === length);
  if (pool.length === 0) pool = list;
  if (pool.length > 1 && excludeId !== undefined) pool = pool.filter((q) => q.id !== excludeId);
  return pick(pool, rng);
}

/** true when the next generated word should start a new sentence */
export function endsSentence(word: string | undefined): boolean {
  return !word || /[.?!]$/.test(word);
}
