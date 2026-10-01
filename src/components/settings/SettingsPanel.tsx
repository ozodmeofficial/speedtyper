"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import {
  CARET_STYLES,
  CONFIDENCE,
  DEFAULT_SETTINGS,
  FONT_SIZES,
  FONTS,
  fontVar,
  QUICK_RESTART,
  SOUNDS,
  TIMER_STYLES,
  type Settings,
} from "@/lib/settings";
import { COLOR_KEYS, getTheme, pickColors, THEMES, type ThemeColors } from "@/lib/themes";
import { LANGUAGES } from "@/lib/typing/words";
import { LANG_COOKIE, UI_LANGS, UI_LANG_LABELS, type DictKey } from "@/lib/i18n";
import { writeCookie } from "@/lib/client/api";
import { playKey } from "@/lib/client/sound";

function Row({ title, desc, children, wide }: { title: string; desc?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`-mx-3 grid gap-3 rounded-lg px-3 py-4 transition-colors hover:bg-[var(--hover)] ${wide ? "" : "md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:gap-8"}`}>
      <div>
        <h3 className="text-text">{title}</h3>
        {desc ? <p className="mt-1 text-sm leading-relaxed text-sub">{desc}</p> : null}
      </div>
      <div className="flex flex-wrap content-start items-start gap-2">{children}</div>
    </div>
  );
}

function Opt({ active, onClick, children, style }: { active: boolean; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button type="button" className={`btn min-w-[4.5rem] flex-1 px-3 py-2 text-sm ${active ? "active" : ""}`} aria-pressed={active} onClick={onClick} style={style}>
      {children}
    </button>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16">
      <h2 className="display mt-12 mb-1 flex items-center gap-3 text-2xl text-text">
        <span>{title}</span>
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </h2>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

export function SettingsPanel() {
  const { settings: s, update, replace, previewTheme } = useApp();
  const { t, lang } = useI18n();
  const router = useRouter();
  const onOff = (key: keyof Settings) => (
    <>
      <Opt active={s[key] === false} onClick={() => update({ [key]: false } as Partial<Settings>)}>
        {t("common.off")}
      </Opt>
      <Opt active={s[key] === true} onClick={() => update({ [key]: true } as Partial<Settings>)}>
        {t("common.on")}
      </Opt>
    </>
  );

  const [custom, setCustom] = useState<ThemeColors>(() => s.customTheme ?? pickColors(getTheme(s.theme)));
  const setColor = (k: keyof ThemeColors, v: string) => {
    const next = { ...custom, [k]: v };
    setCustom(next);
    update({ customTheme: next, useCustomTheme: true });
  };

  const sections = [
    ["behavior", t("settings.sectionBehavior")],
    ["input", t("settings.sectionInput")],
    ["sound", t("settings.sectionSound")],
    ["caret", t("settings.sectionCaret")],
    ["appearance", t("settings.sectionAppearance")],
    ["theme", t("settings.sectionTheme")],
    ["danger", t("settings.sectionDanger")],
  ];

  return (
    <div className="mx-auto w-full py-8">
      <h1 className="text-4xl text-text">{t("settings.title")}</h1>
      <p className="mt-2 text-sm text-sub">{t("settings.syncNote")}</p>
      <nav className="sticky top-0 z-10 -mx-2 mt-6 flex gap-1 overflow-x-auto border-b border-line bg-bg/90 px-2 py-2 backdrop-blur [scrollbar-width:none]" aria-label="sections">
        {sections.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-sub transition-colors hover:bg-sub-alt hover:text-text">
            {label}
          </a>
        ))}
      </nav>

      <Section id="behavior" title={t("settings.sectionBehavior")}>
        <Row title={t("settings.language")} desc={t("settings.languageDesc")}>
          {UI_LANGS.map((l) => (
            <Opt
              key={l}
              active={lang === l}
              onClick={() => {
                writeCookie(LANG_COOKIE, l);
                router.refresh();
              }}
            >
              {UI_LANG_LABELS[l]}
            </Opt>
          ))}
        </Row>
        <Row title={t("settings.testLanguage")} desc={t("settings.testLanguageDesc")}>
          {LANGUAGES.map((l) => (
            <Opt key={l.id} active={s.language === l.id} onClick={() => update({ language: l.id })}>
              {l.label}
            </Opt>
          ))}
        </Row>
        <Row title={t("settings.quickRestart")} desc={t("settings.quickRestartDesc")}>
          {QUICK_RESTART.map((q) => (
            <Opt key={q} active={s.quickRestart === q} onClick={() => update({ quickRestart: q })}>
              {t(`restart.${q}` as DictKey)}
            </Opt>
          ))}
        </Row>
        <Row title={t("settings.blind")} desc={t("settings.blindDesc")}>
          {onOff("blindMode")}
        </Row>
        <Row title={t("settings.minWpm")} desc={t("settings.minWpmDesc")}>
          {[0, 40, 60, 80, 100].map((n) => (
            <Opt key={n} active={s.minWpm === n} onClick={() => update({ minWpm: n })}>
              {n === 0 ? t("common.off") : n}
            </Opt>
          ))}
        </Row>
        <Row title={t("settings.minAcc")} desc={t("settings.minAccDesc")}>
          {[0, 80, 90, 95, 98].map((n) => (
            <Opt key={n} active={s.minAcc === n} onClick={() => update({ minAcc: n })}>
              {n === 0 ? t("common.off") : `${n}%`}
            </Opt>
          ))}
        </Row>
      </Section>

      <Section id="input" title={t("settings.sectionInput")}>
        <Row title={t("settings.freedom")} desc={t("settings.freedomDesc")}>
          {onOff("freedomMode")}
        </Row>
        <Row title={t("settings.confidence")} desc={t("settings.confidenceDesc")}>
          {CONFIDENCE.map((c) => (
            <Opt key={c} active={s.confidenceMode === c} onClick={() => update({ confidenceMode: c })}>
              {c === "max" ? t("common.max") : c === "on" ? t("common.on") : t("common.off")}
            </Opt>
          ))}
        </Row>
      </Section>

      <Section id="sound" title={t("settings.sectionSound")}>
        <Row title={t("settings.sound")} desc={t("settings.soundDesc")}>
          {SOUNDS.map((snd) => (
            <Opt
              key={snd}
              active={s.sound === snd}
              onClick={() => {
                update({ sound: snd });
                playKey(snd, s.soundVolume);
              }}
            >
              {t(`sound.${snd}` as DictKey)}
            </Opt>
          ))}
        </Row>
        <Row title={t("settings.volume")}>
          {[0.25, 0.5, 0.75, 1].map((v) => (
            <Opt
              key={v}
              active={s.soundVolume === v}
              onClick={() => {
                update({ soundVolume: v });
                playKey(s.sound === "off" ? "click" : s.sound, v);
              }}
            >
              {Math.round(v * 100)}%
            </Opt>
          ))}
        </Row>
      </Section>

      <Section id="caret" title={t("settings.sectionCaret")}>
        <Row title={t("settings.caretStyle")} desc={t("settings.caretStyleDesc")}>
          {CARET_STYLES.map((c) => (
            <Opt key={c} active={s.caretStyle === c} onClick={() => update({ caretStyle: c })}>
              {t(`caret.${c}` as DictKey)}
            </Opt>
          ))}
        </Row>
        <Row title={t("settings.smoothCaret")} desc={t("settings.smoothCaretDesc")}>
          {onOff("smoothCaret")}
        </Row>
      </Section>

      <Section id="appearance" title={t("settings.sectionAppearance")}>
        <Row title={t("settings.effects")} desc={t("settings.effectsDesc")}>
          {onOff("effects")}
        </Row>
        <Row title={t("settings.liveWpm")} desc={t("settings.liveWpmDesc")}>
          {onOff("liveWpm")}
        </Row>
        <Row title={t("settings.liveAcc")} desc={t("settings.liveAccDesc")}>
          {onOff("liveAcc")}
        </Row>
        <Row title={t("settings.timerStyle")} desc={t("settings.timerStyleDesc")}>
          {TIMER_STYLES.map((ts) => (
            <Opt key={ts} active={s.timerStyle === ts} onClick={() => update({ timerStyle: ts })}>
              {ts === "text" ? t("common.text") : ts === "bar" ? t("common.bar") : t("common.off")}
            </Opt>
          ))}
        </Row>
        <Row title={t("settings.tape")} desc={t("settings.tapeDesc")}>
          {onOff("tapeMode")}
        </Row>
        <Row title={t("settings.keyTips")} desc={t("settings.keyTipsDesc")}>
          {onOff("showKeyTips")}
        </Row>
        <Row title={t("settings.fontSize")} desc={t("settings.fontSizeDesc")}>
          {FONT_SIZES.map((f) => (
            <Opt key={f} active={s.fontSize === f} onClick={() => update({ fontSize: f })}>
              {f}
            </Opt>
          ))}
        </Row>
        <Row title={t("settings.fontFamily")} desc={t("settings.fontFamilyDesc")} wide>
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {FONTS.map((f) => (
              <Opt key={f.id} active={s.fontFamily === f.id} onClick={() => update({ fontFamily: f.id })} style={{ fontFamily: fontVar(f.id) }}>
                {f.label}
              </Opt>
            ))}
          </div>
        </Row>
      </Section>

      <Section id="theme" title={t("settings.sectionTheme")}>
        <Row title={t("settings.theme")} desc={t("settings.themeDesc")} wide>
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" onMouseLeave={() => previewTheme(null)}>
            {THEMES.map((th) => {
              const active = !s.useCustomTheme && s.theme === th.id;
              return (
                <button
                  key={th.id}
                  type="button"
                  aria-pressed={active}
                  onMouseEnter={() => previewTheme(th)}
                  onFocus={() => previewTheme(th)}
                  onBlur={() => previewTheme(null)}
                  onClick={() => update({ theme: th.id, useCustomTheme: false })}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-transform hover:scale-[1.03]"
                  style={{ background: th.bg, color: th.main, boxShadow: active ? `0 0 0 2px ${th.main}` : `0 0 0 1px ${th.subAlt}` }}
                >
                  <span className="truncate">
                    {active ? "✓ " : ""}
                    {th.name}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {[th.main, th.sub, th.text].map((c, i) => (
                      <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </Row>
        <Row title={t("settings.customTheme")} desc={t("settings.customThemeDesc")} wide>
          <div className="w-full">
            <div className="mb-4 flex flex-wrap gap-2">
              <Opt active={s.useCustomTheme} onClick={() => update({ useCustomTheme: !s.useCustomTheme, customTheme: s.customTheme ?? custom })}>
                {t("settings.useCustom")}: {s.useCustomTheme ? t("common.on") : t("common.off")}
              </Opt>
              <button
                type="button"
                className="btn flex-1 px-3 py-2 text-sm"
                onClick={() => {
                  const c = pickColors(getTheme(s.theme));
                  setCustom(c);
                  update({ customTheme: c });
                }}
              >
                {t("settings.resetCustom")}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {COLOR_KEYS.map((k) => (
                <label key={k} className="card flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="truncate text-sub">{t(`color.${k}` as DictKey)}</span>
                  <input
                    type="color"
                    value={custom[k]}
                    onChange={(e) => setColor(k, e.target.value)}
                    className="h-7 w-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                    aria-label={t(`color.${k}` as DictKey)}
                  />
                </label>
              ))}
            </div>
          </div>
        </Row>
      </Section>

      <Section id="danger" title={t("settings.sectionDanger")}>
        <Row title={t("settings.reset")} desc={t("settings.resetDesc")}>
          <button
            type="button"
            className="btn flex-1 px-3 py-2 text-sm hover:!bg-error hover:!text-bg"
            onClick={() => {
              if (window.confirm(t("settings.resetConfirm"))) {
                replace(DEFAULT_SETTINGS);
                setCustom(pickColors(getTheme(DEFAULT_SETTINGS.theme)));
              }
            }}
          >
            {t("settings.reset")}
          </button>
        </Row>
      </Section>
    </div>
  );
}
