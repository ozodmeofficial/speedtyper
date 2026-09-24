import english from "../../data/words/english.json";
import english1k from "../../data/words/english_1k.json";
import uzbek from "../../data/words/uzbek.json";
import russian from "../../data/words/russian.json";
import qEnglish from "../../data/quotes/english.json";
import qUzbek from "../../data/quotes/uzbek.json";
import qRussian from "../../data/quotes/russian.json";
import { generateWords, pickQuote, type Quote } from "../../lib/typing/words";
import { quoteLenCode, type RaceLanguage, type TextType } from "../../lib/race/protocol";

const WORDS: Record<RaceLanguage, string[]> = {
  english: english.words,
  english_1k: english1k.words,
  uzbek: uzbek.words,
  russian: russian.words,
};

const QUOTES: Record<RaceLanguage, Quote[]> = {
  english: qEnglish.quotes,
  english_1k: qEnglish.quotes,
  uzbek: qUzbek.quotes,
  russian: qRussian.quotes,
};

export function raceText(lang: RaceLanguage, tt: TextType, len: number): { text: string; src: string | null } {
  if (tt === "quote") {
    const q = pickQuote(QUOTES[lang], quoteLenCode(len));
    return { text: q.text, src: `${q.author} — ${q.source}` };
  }
  return { text: generateWords(WORDS[lang], len).join(" "), src: null };
}
