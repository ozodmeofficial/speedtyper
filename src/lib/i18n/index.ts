import { uz, type Dict, type DictKey } from "./uz";
import { en } from "./en";
import { ru } from "./ru";

export type { Dict, DictKey };
export const UI_LANGS = ["uz", "en", "ru"] as const;
export type UiLang = (typeof UI_LANGS)[number];
export const DEFAULT_UI_LANG: UiLang = "uz";
export const LANG_COOKIE = "st_lang";
export const UI_LANG_LABELS: Record<UiLang, string> = { uz: "O‘zbekcha", en: "English", ru: "Русский" };

const DICTS: Record<UiLang, Dict> = { uz, en, ru };

export function isUiLang(v: unknown): v is UiLang {
  return typeof v === "string" && (UI_LANGS as readonly string[]).includes(v);
}

export function getDict(lang: UiLang): Dict {
  return DICTS[lang] ?? uz;
}

export type Vars = Record<string, string | number>;

export function translate(dict: Dict, key: DictKey, vars?: Vars): string {
  let s: string = dict[key] ?? uz[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
