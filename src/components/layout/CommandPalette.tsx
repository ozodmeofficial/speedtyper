"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import {
  CARET_STYLES,
  CONFIDENCE,
  FONT_SIZES,
  FONTS,
  MODES,
  QUICK_RESTART,
  QUOTE_LENGTHS,
  SOUNDS,
  TIME_OPTIONS,
  TIMER_STYLES,
  WORD_OPTIONS,
  type Settings,
} from "@/lib/settings";
import { THEMES, type ThemeColors } from "@/lib/themes";
import { LANGUAGES } from "@/lib/typing/words";
import { LANG_COOKIE, UI_LANGS, UI_LANG_LABELS, type DictKey } from "@/lib/i18n";
import { writeCookie } from "@/lib/client/api";

interface Command {
  id: string;
  group: string;
  label: string;
  active?: boolean;
  preview?: ThemeColors;
  swatch?: string[];
  run: () => void;
}

/** fuzzy score; -1 = no match */
export function fuzzyScore(text: string, query: string): number {
  const hay = text.toLowerCase();
  let total = 0;
  for (const tok of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const idx = hay.indexOf(tok);
    if (idx >= 0) {
      total += 100 - Math.min(idx, 90) + (idx === 0 || hay[idx - 1] === " " ? 20 : 0);
      continue;
    }
    let j = 0;
    let gaps = 0;
    for (let i = 0; i < hay.length && j < tok.length; i++) {
      if (hay[i] === tok[j]) j++;
      else if (j > 0) gaps++;
    }
    if (j < tok.length) return -1;
    total += Math.max(1, 30 - gaps);
  }
  return total;
}

export function CommandPalette() {
  const { settings, update, previewTheme, paletteOpen, closePalette, paletteQuery, user } = useApp();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState(paletteQuery);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (paletteOpen) {
      restoreFocus.current = document.activeElement as HTMLElement | null;
      setQuery(paletteQuery);
      setSel(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [paletteOpen, paletteQuery]);

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = [];
    const onOff = (v: boolean) => (v ? t("common.on") : t("common.off"));
    const set = (patch: Partial<Settings>) => () => update(patch);
    const g = (k: DictKey) => t(k).toLowerCase();

    for (const m of MODES) out.push({ id: `mode-${m}`, group: g("table.mode"), label: t(`config.${m}` as DictKey), active: settings.mode === m, run: set({ mode: m }) });
    for (const n of TIME_OPTIONS) out.push({ id: `time-${n}`, group: g("config.time"), label: String(n), active: settings.mode === "time" && settings.time === n, run: set({ mode: "time", time: n }) });
    for (const n of WORD_OPTIONS) out.push({ id: `words-${n}`, group: g("config.words"), label: String(n), active: settings.mode === "words" && settings.words === n, run: set({ mode: "words", words: n }) });
    for (const q of QUOTE_LENGTHS) out.push({ id: `quote-${q}`, group: g("config.quote"), label: t(`quote.${q}` as DictKey), active: settings.mode === "quote" && settings.quoteLength === q, run: set({ mode: "quote", quoteLength: q }) });
    out.push({ id: "punct", group: g("config.punctuation"), label: onOff(!settings.punctuation), run: set({ punctuation: !settings.punctuation }) });
    out.push({ id: "numbers", group: g("config.numbers"), label: onOff(!settings.numbers), run: set({ numbers: !settings.numbers }) });
    for (const l of LANGUAGES) out.push({ id: `lang-${l.id}`, group: g("settings.testLanguage"), label: l.label, active: settings.language === l.id, run: set({ language: l.id }) });
    for (const th of THEMES)
      out.push({
        id: `theme-${th.id}`,
        group: "theme",
        label: th.name,
        active: !settings.useCustomTheme && settings.theme === th.id,
        preview: th,
        swatch: [th.bg, th.main, th.sub, th.text],
        run: set({ theme: th.id, useCustomTheme: false }),
      });
    out.push({
      id: "theme-random",
      group: "theme",
      label: "random",
      run: () => update({ theme: THEMES[Math.floor(Math.random() * THEMES.length)].id, useCustomTheme: false }),
    });
    if (settings.customTheme) out.push({ id: "custom-theme", group: g("settings.customTheme"), label: onOff(!settings.useCustomTheme), run: set({ useCustomTheme: !settings.useCustomTheme }) });
    for (const f of FONTS) out.push({ id: `font-${f.id}`, group: g("settings.fontFamily"), label: f.label, active: settings.fontFamily === f.id, run: set({ fontFamily: f.id }) });
    for (const s of FONT_SIZES) out.push({ id: `fs-${s}`, group: g("settings.fontSize"), label: String(s), active: settings.fontSize === s, run: set({ fontSize: s }) });
    for (const c of CARET_STYLES) out.push({ id: `caret-${c}`, group: g("settings.caretStyle"), label: t(`caret.${c}` as DictKey), active: settings.caretStyle === c, run: set({ caretStyle: c }) });
    out.push({ id: "smooth", group: g("settings.smoothCaret"), label: onOff(!settings.smoothCaret), run: set({ smoothCaret: !settings.smoothCaret }) });
    out.push({ id: "livewpm", group: g("settings.liveWpm"), label: onOff(!settings.liveWpm), run: set({ liveWpm: !settings.liveWpm }) });
    out.push({ id: "liveacc", group: g("settings.liveAcc"), label: onOff(!settings.liveAcc), run: set({ liveAcc: !settings.liveAcc }) });
    for (const s of TIMER_STYLES) out.push({ id: `timer-${s}`, group: g("settings.timerStyle"), label: s === "text" ? t("common.text") : s === "bar" ? t("common.bar") : t("common.off"), active: settings.timerStyle === s, run: set({ timerStyle: s }) });
    out.push({ id: "tape", group: g("settings.tape"), label: onOff(!settings.tapeMode), run: set({ tapeMode: !settings.tapeMode }) });
    out.push({ id: "blind", group: g("settings.blind"), label: onOff(!settings.blindMode), run: set({ blindMode: !settings.blindMode }) });
    out.push({ id: "freedom", group: g("settings.freedom"), label: onOff(!settings.freedomMode), run: set({ freedomMode: !settings.freedomMode }) });
    for (const c of CONFIDENCE) out.push({ id: `conf-${c}`, group: g("settings.confidence"), label: c === "max" ? t("common.max") : c === "on" ? t("common.on") : t("common.off"), active: settings.confidenceMode === c, run: set({ confidenceMode: c }) });
    for (const q of QUICK_RESTART) out.push({ id: `qr-${q}`, group: g("settings.quickRestart"), label: t(`restart.${q}` as DictKey), active: settings.quickRestart === q, run: set({ quickRestart: q }) });
    for (const s of SOUNDS) out.push({ id: `sound-${s}`, group: g("settings.sound"), label: t(`sound.${s}` as DictKey), active: settings.sound === s, run: set({ sound: s }) });
    out.push({ id: "keytips", group: g("settings.keyTips"), label: onOff(!settings.showKeyTips), run: set({ showKeyTips: !settings.showKeyTips }) });
    for (const l of UI_LANGS)
      out.push({
        id: `ui-${l}`,
        group: g("settings.language"),
        label: UI_LANG_LABELS[l],
        active: lang === l,
        run: () => {
          writeCookie(LANG_COOKIE, l);
          router.refresh();
        },
      });
    const go = (href: string) => () => router.push(href);
    out.push({ id: "go-test", group: "→", label: t("nav.test"), run: go("/") });
    out.push({ id: "go-race", group: "→", label: t("nav.race"), run: go("/race") });
    out.push({ id: "go-lb", group: "→", label: t("nav.leaderboard"), run: go("/leaderboard") });
    out.push({ id: "go-settings", group: "→", label: t("nav.settings"), run: go("/settings") });
    out.push({ id: "go-about", group: "→", label: t("nav.about"), run: go("/about") });
    out.push({ id: "go-account", group: "→", label: user ? t("nav.profile") : t("nav.login"), run: go(user ? `/u/${user.username}` : "/login") });
    return out;
  }, [settings, update, t, lang, router, user]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return commands;
    return commands
      .map((c, i) => ({ c, i, s: fuzzyScore(`${c.group} ${c.label}`, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.c);
  }, [commands, query]);

  const current = filtered[Math.min(sel, filtered.length - 1)];

  useEffect(() => {
    if (!paletteOpen) return;
    previewTheme(current?.preview ?? null);
  }, [current, paletteOpen, previewTheme]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!paletteOpen) return null;

  const close = () => {
    closePalette();
    restoreFocus.current?.focus?.();
  };
  const choose = (c: Command | undefined) => {
    if (!c) return;
    c.run();
    closePalette();
    requestAnimationFrame(() => restoreFocus.current?.focus?.());
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      setSel((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(current);
    }
  };

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex justify-center bg-black/50 px-4 pt-[12vh]"
      data-modal-open
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="command palette"
        className="flex h-fit max-h-[70vh] w-full max-w-[680px] flex-col overflow-hidden rounded-lg bg-bg shadow-2xl ring-1 ring-sub-alt"
        onKeyDown={onKey}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSel(0);
          }}
          placeholder={t("palette.placeholder")}
          className="w-full bg-transparent px-5 py-4 text-text outline-none placeholder:text-sub"
          aria-label={t("palette.placeholder")}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={current ? `cmd-${current.id}` : undefined}
          spellCheck={false}
          autoComplete="off"
        />
        <div ref={listRef} id="palette-list" role="listbox" className="overflow-y-auto pb-2">
          {filtered.length === 0 ? (
            <div className="px-5 py-3 text-sm text-sub">{t("palette.empty")}</div>
          ) : (
            filtered.map((c, i) => (
              <div
                key={c.id}
                id={`cmd-${c.id}`}
                data-idx={i}
                role="option"
                aria-selected={i === sel}
                onMouseMove={() => i !== sel && setSel(i)}
                onClick={() => choose(c)}
                className={`flex cursor-pointer items-center gap-3 px-5 py-2 text-sm ${i === sel ? "bg-text text-bg" : "text-text"}`}
              >
                <span className="w-4 shrink-0 text-center">{c.active ? "✓" : ""}</span>
                <span className={i === sel ? "opacity-70" : "text-sub"}>{c.group}</span>
                <span className="opacity-50">›</span>
                <span className="truncate">{c.label}</span>
                {c.swatch ? (
                  <span className="ml-auto flex gap-1 rounded-full p-1" style={{ background: c.swatch[0] }}>
                    {c.swatch.slice(1).map((col, k) => (
                      <span key={k} className="h-2.5 w-2.5 rounded-full" style={{ background: col }} />
                    ))}
                  </span>
                ) : null}
              </div>
            ))
          )}
        </div>
        <div className="border-t border-sub-alt px-5 py-2 text-[0.7rem] text-sub">{t("palette.hint")}</div>
      </div>
    </div>
  );
}
