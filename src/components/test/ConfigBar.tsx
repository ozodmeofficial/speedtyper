"use client";

import { useT } from "@/components/providers/I18nProvider";
import { QUOTE_LENGTHS, TIME_OPTIONS, WORD_OPTIONS, type Settings } from "@/lib/settings";
import type { TestMode } from "@/lib/typing/engine";
import type { DictKey } from "@/lib/i18n";

function Item({ active, onClick, children, title, compact }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string; compact?: boolean }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={title}
      aria-pressed={active}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      className={`dock-item !h-9 sm:!h-10 ${compact ? "min-w-11 justify-center !px-3 tabular" : "!px-3 sm:!px-4"}`}
    >
      {children}
    </button>
  );
}

const Spacer = () => <span className="dock-sep" aria-hidden="true" />;

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

  const options =
    settings.mode === "time"
      ? TIME_OPTIONS.map((n) => (
          <Item key={n} compact active={settings.time === n} onClick={() => update({ time: n })}>
            {n}
          </Item>
        ))
      : settings.mode === "words"
        ? WORD_OPTIONS.map((n) => (
            <Item key={n} compact active={settings.words === n} onClick={() => update({ words: n })}>
              {n}
            </Item>
          ))
        : settings.mode === "quote"
          ? QUOTE_LENGTHS.map((q) => (
              <Item key={q} compact active={settings.quoteLength === q} onClick={() => update({ quoteLength: q })}>
                {t(`quote.${q}` as DictKey)}
              </Item>
            ))
          : settings.mode === "custom"
            ? [
                <Item key="c" onClick={onCustom}>
                  <span aria-hidden="true">✎</span>
                  {t("config.change")}
                </Item>,
              ]
            : null;

  return (
    <div className="mx-auto flex w-full max-w-full flex-wrap items-center justify-center gap-3">
      <div className="dock text-sm leading-none">
        {modes.map((m) => (
          <Item key={m} active={settings.mode === m} onClick={() => update({ mode: m })}>
            <ModeIcon mode={m} />
            <span className="first-letter:uppercase">{t(`config.${m}` as DictKey)}</span>
          </Item>
        ))}
        {canPunct ? (
          <>
            <Spacer />
            <Item active={settings.punctuation} onClick={() => update({ punctuation: !settings.punctuation })} title={t("config.punctuation")}>
              <span className="font-mono text-[1.05em] leading-none">@</span>
              <span className="hidden first-letter:uppercase md:inline">{t("config.punctuation")}</span>
            </Item>
            <Item active={settings.numbers} onClick={() => update({ numbers: !settings.numbers })} title={t("config.numbers")}>
              <span className="font-mono text-[1.05em] leading-none">#</span>
              <span className="hidden first-letter:uppercase md:inline">{t("config.numbers")}</span>
            </Item>
          </>
        ) : null}
      </div>
      {options ? <div className="dock text-sm leading-none">{options}</div> : null}
    </div>
  );
}

function ModeIcon({ mode }: { mode: TestMode }) {
  const p = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
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
