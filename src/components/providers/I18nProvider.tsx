"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { translate, type Dict, type DictKey, type UiLang, type Vars } from "@/lib/i18n";

interface I18nCtx {
  lang: UiLang;
  dict: Dict;
  t: (key: DictKey, vars?: Vars) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ lang, dict, children }: { lang: UiLang; dict: Dict; children: React.ReactNode }) {
  const t = useCallback((key: DictKey, vars?: Vars) => translate(dict, key, vars), [dict]);
  const value = useMemo(() => ({ lang, dict, t }), [lang, dict, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside provider");
  return v;
}

export const useT = () => useI18n().t;
