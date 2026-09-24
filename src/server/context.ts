import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { decodeSettingsCookie, SETTINGS_COOKIE } from "@/lib/settings";
import { DEFAULT_UI_LANG, getDict, isUiLang, LANG_COOKIE, translate, type DictKey, type Vars } from "@/lib/i18n";
import { getCurrentUser } from "./auth/next";

/** Per-request context for server components (cached per request). */
export const getRequestContext = cache(async () => {
  const jar = await cookies();
  const h = await headers();
  const rawLang = jar.get(LANG_COOKIE)?.value;
  const lang = isUiLang(rawLang) ? rawLang : DEFAULT_UI_LANG;
  const dict = getDict(lang);
  const settings = decodeSettingsCookie(jar.get(SETTINGS_COOKIE)?.value);
  const user = await getCurrentUser();
  const nonce = h.get("x-nonce") ?? undefined;
  const t = (key: DictKey, vars?: Vars) => translate(dict, key, vars);
  return { lang, dict, settings, user, nonce, t };
});
