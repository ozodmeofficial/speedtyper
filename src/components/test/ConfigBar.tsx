"use client";

import { useT } from "@/components/providers/I18nProvider";
import { QUOTE_LENGTHS, TIME_OPTIONS, WORD_OPTIONS, type Settings } from "@/lib/settings";
import type { TestMode } from "@/lib/typing/engine";
import type { DictKey } from "@/lib/i18n";

function Item({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={title}
      aria-pressed={active}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      className="text-btn flex shrink-0 items-center gap-1.5 px-1.5 py-2 whitespace-nowrap sm:px-2 sm:py-1.5"
    >
      {children}
    </button>
  );
}

const Spacer = () => <span className="mx-1.5 h-5 w-[3px] shrink-0 rounded-full bg-bg" aria-hidden="true" />;

export function ConfigBar({
  settings,
  update,
  onCustom,
}: {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  onCustom: () => void;
}) {
  const t = useT();
  const modes: TestMode[] = ["time", "words", "quote", "zen", "custom"];
  const canPunct = settings.mode === "time" || settings.mode === "words";

  return (
    <div className="mx-auto flex w-fit max-w-full items-center overflow-x-auto rounded-lg bg-sub-alt px-1.5 text-[0.78rem] leading-none [scrollbar-width:none] sm:px-2.5">
      {canPunct ? (
        <span className="hidden items-center sm:flex">
          <Item active={settings.punctuation} onClick={() => update({ punctuation: !settings.punctuation })}>
            <span className="font-mono text-[0.9em]">@</span>
            {t("config.punctuation")}
          </Item>
          <Item active={settings.numbers} onClick={() => update({ numbers: !settings.numbers })}>
            <span className="font-mono text-[0.9em]">#</span>
            {t("config.numbers")}
          </Item>
          <Spacer />
        </span>
      ) : null}
      {modes.map((m) => (
        <Item key={m} active={settings.mode === m} onClick={() => update({ mode: m })}>
          <span className="hidden sm:inline">
            <ModeIcon mode={m} />
          </span>
          {t(`config.${m}` as DictKey)}
        </Item>
      ))}
      {settings.mode !== "zen" ? <Spacer /> : null}
      {settings.mode === "time"
        ? TIME_OPTIONS.map((n) => (
            <Item key={n} active={settings.time === n} onClick={() => update({ time: n })}>
              {n}
            </Item>
          ))
        : null}
      {settings.mode === "words"
        ? WORD_OPTIONS.map((n) => (
            <Item key={n} active={settings.words === n} onClick={() => update({ words: n })}>
              {n}
            </Item>
          ))
        : null}
      {settings.mode === "quote"
        ? QUOTE_LENGTHS.map((q) => (
            <Item key={q} active={settings.quoteLength === q} onClick={() => update({ quoteLength: q })}>
              {t(`quote.${q}` as DictKey)}
            </Item>
          ))
        : null}
      {settings.mode === "custom" ? (
        <Item onClick={onCustom}>
          <span aria-hidden="true">✎</span>
          {t("config.change")}
        </Item>
      ) : null}
    </div>
  );
}

function ModeIcon({ mode }: { mode: TestMode }) {
  const p = { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (mode) {
    case "time":
      return (
        <svg {...p}>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2 2M10 2h4" />
        </svg>
      );
    case "words":
      return (
        <svg {...p}>
          <path d="M4 7V5h16v2M9 19h6M12 5v14" />
        </svg>
      );
    case "quote":
      return (
        <svg {...p}>
          <path d="M3 21c3 0 7-1 7-8V5H3v7h4c0 4-2 6-4 6M14 21c3 0 7-1 7-8V5h-7v7h4c0 4-2 6-4 6" />
        </svg>
      );
    case "zen":
      return (
        <svg {...p}>
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
  }
}
