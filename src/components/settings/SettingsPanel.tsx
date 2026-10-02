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
    <div className={`grid gap-3 px-5 py-5 sm:px-6 ${wide ? "" : "md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center md:gap-8"}`}>
      <div>
        <h3 className="font-medium text-text first-letter:uppercase">{title}</h3>
        {desc ? <p className="mt-1 text-sm leading-relaxed text-sub">{desc}</p> : null}
      </div>
      <div className={`flex flex-wrap content-start items-center gap-2 ${wide ? "" : "md:justify-end"}`}>{children}</div>
    </div>
  );
}

function Opt({ active, onClick, children, style }: { active: boolean; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button type="button" className={`btn min-w-[4.25rem] flex-1 px-3 py-2 text-sm md:flex-none ${active ? "active" : ""}`} aria-pressed={active} onClick={onClick} style={style}>
      {children}
    </button>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)} />;
}

const SECTION_ICONS: Record<string, string> = {
  behavior: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  input: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8",
  sound: "M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  caret: "M12 4v16M8 4h8M8 20h8",
  appearance: "M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4",
  theme: "M12 21.5a9.5 9.5 0 1 1 9.5-9.5c0 2.6-2.1 3.5-4 3.5h-2a2 2 0 0 0-1.4 3.4c.4.4.6.9.6 1.4 0 .7-.6 1.2-1.3 1.2H12Z",
  danger: "M12 3 2 20h20L12 3ZM12 10v4M12 17h.01",
};

function SectionIcon({ id }: { id: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={SECTION_ICONS[id] ?? ""} />
    </svg>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-3 flex items-center gap-2.5 text-lg font-semibold text-text">
        <span className="tile !h-8 !w-8 !rounded-lg">
          <SectionIcon id={id} />
        </span>
        <span className="first-letter:uppercase">{title}</span>
      </h2>
      <div className={`card divide-y divide-line ${id === "danger" ? "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--error)_35%,transparent)]" : ""}`}>{children}</div>
    </section>
  );
}

export function SettingsPanel() {
  const { settings: s, update, replace, previewTheme } = useApp();
  const { t, lang } = useI18n();
  const router = useRouter();
  const onOff = (key: keyof Settings) => (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-sub">
      <span className="tabular">{s[key] === true ? t("common.on") : t("common.off")}</span>
      <Switch on={s[key] === true} onChange={(v) => update({ [key]: v } as Partial<Settings>)} label={t("common.on")} />
    </label>
  );
  const [activeSection, setActiveSection] = useState("behavior");

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl text-text">{t("settings.title")}</h1>
          <p className="mt-2 text-sm text-sub">{t("settings.syncNote")}</p>
        </div>
      </div>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav className="dock sticky top-3 z-10 w-full lg:flex-col lg:items-stretch lg:p-2" aria-label="sections">
        {sections.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={() => setActiveSection(id)}
            aria-current={activeSection === id ? "page" : undefined}
            className="dock-item !h-10 lg:!justify-start"
          >
            <SectionIcon id={id} />
            <span className="first-letter:uppercase">{label}</span>
          </a>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-10">

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
        <Row title={t("settings.dashboard")} desc={t("settings.dashboardDesc")}>
          {onOff("dashboard")}
        </Row>
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
                  className="group flex flex-col gap-2.5 rounded-xl p-3 text-left text-sm transition-transform hover:-translate-y-0.5"
                  style={{ background: th.bg, color: th.text, boxShadow: active ? `0 0 0 2px ${th.main}, 0 8px 24px -10px ${th.main}` : `0 0 0 1px color-mix(in srgb, ${th.text} 12%, transparent)` }}
                >
                  <span className="flex w-full items-center gap-1.5 font-mono text-[0.8rem] leading-none">
                    <span style={{ color: th.text }}>type</span>
                    <span style={{ color: th.sub }}>fast</span>
                    <span className="inline-block h-3.5 w-0.5 rounded-full" style={{ background: th.caret }} />
                  </span>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate" style={{ color: th.main }}>
                      {active ? "✓ " : ""}
                      {th.name}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {[th.main, th.sub, th.text].map((c, i) => (
                        <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                      ))}
                    </span>
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
      </div>
    </div>
  );
}
