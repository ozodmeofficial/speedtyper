"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { GlobeIcon, PaletteIcon, TerminalIcon } from "@/components/ui/icons";
import { UI_LANGS, UI_LANG_LABELS, LANG_COOKIE, type UiLang } from "@/lib/i18n";
import { getTheme } from "@/lib/themes";
import { writeCookie } from "@/lib/client/api";

export function Footer() {
  const { t, lang } = useI18n();
  const { settings, openPalette } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();

  const setLang = (l: UiLang) => {
    writeCookie(LANG_COOKIE, l);
    start(() => router.refresh());
  };

  return (
    <footer className="page chrome flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 py-6 text-xs text-sub">
      <button type="button" className="text-btn flex items-center gap-1.5" onClick={() => openPalette()}>
        <TerminalIcon size={14} />
        <span>{t("test.hintPalette")}</span>
      </button>
      <div className="ml-auto flex items-center gap-5">
        <label className="flex items-center gap-1.5">
          <GlobeIcon size={14} />
          <span className="sr-only">{t("footer.uiLanguage")}</span>
          <select
            value={lang}
            disabled={pending}
            onChange={(e) => setLang(e.target.value as UiLang)}
            className="text-btn cursor-pointer appearance-none bg-transparent outline-none"
            aria-label={t("footer.uiLanguage")}
          >
            {UI_LANGS.map((l) => (
              <option key={l} value={l} className="bg-sub-alt text-text">
                {UI_LANG_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="text-btn flex items-center gap-1.5" onClick={() => openPalette("theme ")}>
          <PaletteIcon size={14} />
          <span>{settings.useCustomTheme && settings.customTheme ? "custom" : getTheme(settings.theme).name}</span>
        </button>
      </div>
    </footer>
  );
}
