"use client";

import type { LanguageId, Quote, QuoteLanguage, QuoteList, Wordlist } from "@/lib/typing/words";

const wordCache = new Map<LanguageId, Promise<string[]>>();
const quoteCache = new Map<QuoteLanguage, Promise<Quote[]>>();
const loadedWords = new Map<LanguageId, string[]>();
const loadedQuotes = new Map<QuoteLanguage, Quote[]>();

const WORD_LOADERS: Record<LanguageId, () => Promise<{ default: Wordlist }>> = {
  english: () => import("@/data/words/english.json"),
  english_1k: () => import("@/data/words/english_1k.json"),
  uzbek: () => import("@/data/words/uzbek.json"),
  russian: () => import("@/data/words/russian.json"),
};

const QUOTE_LOADERS: Record<QuoteLanguage, () => Promise<{ default: QuoteList }>> = {
  english: () => import("@/data/quotes/english.json"),
  uzbek: () => import("@/data/quotes/uzbek.json"),
  russian: () => import("@/data/quotes/russian.json"),
};

export function loadWords(lang: LanguageId): Promise<string[]> {
  let p = wordCache.get(lang);
  if (!p) {
    p = WORD_LOADERS[lang]().then((m) => {
      loadedWords.set(lang, m.default.words);
      return m.default.words;
    });
    wordCache.set(lang, p);
  }
  return p;
}

export function loadQuotes(lang: QuoteLanguage): Promise<Quote[]> {
  let p = quoteCache.get(lang);
  if (!p) {
    p = QUOTE_LOADERS[lang]().then((m) => {
      loadedQuotes.set(lang, m.default.quotes);
      return m.default.quotes;
    });
    quoteCache.set(lang, p);
  }
  return p;
}

export const wordsIfLoaded = (lang: LanguageId) => loadedWords.get(lang) ?? null;
export const quotesIfLoaded = (lang: QuoteLanguage) => loadedQuotes.get(lang) ?? null;
