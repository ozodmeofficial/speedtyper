import "server-only";
import english from "@/data/words/english.json";
import english1k from "@/data/words/english_1k.json";
import uzbek from "@/data/words/uzbek.json";
import russian from "@/data/words/russian.json";
import qEnglish from "@/data/quotes/english.json";
import qUzbek from "@/data/quotes/uzbek.json";
import qRussian from "@/data/quotes/russian.json";
import type { Settings } from "@/lib/settings";
import type { LanguageId, Quote, QuoteLanguage } from "@/lib/typing/words";
import { buildTestWords, quoteLanguageOf, testSignature, type InitialTest } from "@/components/test/testSetup";

const WORDS: Record<LanguageId, string[]> = {
  english: english.words,
  english_1k: english1k.words,
  uzbek: uzbek.words,
  russian: russian.words,
};
const QUOTES: Record<QuoteLanguage, Quote[]> = { english: qEnglish.quotes, uzbek: qUzbek.quotes, russian: qRussian.quotes };

/** Server-generated first test so the words are in the HTML (instant first paint). */
export function initialTestFor(s: Settings): InitialTest | null {
  if (s.mode === "custom") return null;
  const built = buildTestWords(s, WORDS[s.language], QUOTES[quoteLanguageOf(s.language)], "");
  if (!built) return null;
  return { signature: testSignature(s), words: built.words, quote: built.quote };
}
