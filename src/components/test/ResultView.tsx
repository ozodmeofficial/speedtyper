"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useT } from "@/components/providers/I18nProvider";
import { ChevronRightIcon, ImageIcon, RepeatIcon, TargetIcon, CrownIcon } from "@/components/ui/icons";
import { ResultChart } from "./ResultChart";
import type { EngineResult } from "@/lib/typing/engine";
import type { TestSpec } from "./testSetup";
import { languageInfo } from "@/lib/typing/words";
import type { DictKey } from "@/lib/i18n";

export interface FinalResult extends EngineResult {
  failed: "min_wpm" | "min_acc" | null;
  invalid: "too_short" | "afk" | null;
}

export type SaveState = "idle" | "saving" | "saved" | "failed" | "rejected" | "guest";

function Stat({ label, value, title, big }: { label: string; value: React.ReactNode; title?: string; big?: boolean }) {
  return (
    <div title={title} className="min-w-0">
      <div className={big ? "text-[2rem] leading-none text-sub" : "text-sm leading-tight text-sub"}>{label}</div>
      <div className={big ? "font-typing text-[4rem] leading-[1.1] text-main" : "font-typing text-[1.6rem] leading-tight text-main"}>{value}</div>
    </div>
  );
}

export function ResultView({
  result,
  spec,
  isPb,
  saveState,
  signedIn,
  onNext,
  onRepeat,
  onPractice,
}: {
  result: FinalResult;
  spec: TestSpec;
  isPb: boolean;
  saveState: SaveState;
  signedIn: boolean;
  onNext: () => void;
  onRepeat: () => void;
  onPractice: () => void;
}) {
  const t = useT();
  const shotRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const failed = result.failed || result.invalid;
  const c = result.counts;
  const correct = c.correctChars + c.correctSpaces;

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const screenshot = async () => {
    const el = shotRef.current;
    if (!el) return;
    try {
      const { toBlob } = await import("html-to-image");
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#323437";
      const blob = await toBlob(el, { backgroundColor: bg, pixelRatio: 2, style: { padding: "24px" }, width: el.offsetWidth + 48, height: el.offsetHeight + 48 });
      if (!blob) throw new Error("no blob");
      if (navigator.clipboard && "ClipboardItem" in window) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          showToast(t("result.screenshotDone"));
          return;
        } catch {
          /* fall back to download */
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `speedtyper-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      showToast(t("result.screenshotSaved"));
    } catch {
      showToast(t("result.screenshotFail"));
    }
  };

  const typeLabel = spec.practice
    ? "practice"
    : spec.mode === "time" || spec.mode === "words"
      ? `${t(`config.${spec.mode}` as DictKey)} ${spec.mode2}`
      : spec.mode === "quote"
        ? `${t("config.quote")} ${t(`quote.${spec.mode2}` as DictKey)}`
        : t(`config.${spec.mode}` as DictKey);

  const saveText: Record<SaveState, string | null> = {
    idle: null,
    guest: null,
    saving: t("result.saving"),
    saved: t("result.saved"),
    failed: t("result.saveFailed"),
    rejected: t("result.rejected"),
  };

  return (
    <div className="fade-in mx-auto w-full" aria-live="polite">
      <div ref={shotRef} className="relative">
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-[auto_1fr]">
          <div className="flex gap-10 md:flex-col md:gap-3">
            <Stat big label="wpm" value={Math.round(result.wpm)} title={`${result.wpm.toFixed(2)} wpm`} />
            <Stat big label={t("result.acc")} value={`${Math.round(result.acc)}%`} title={`${result.acc.toFixed(2)}%`} />
            {isPb && !failed ? (
              <div className="flex items-center gap-1.5 text-sm text-main">
                <CrownIcon size={16} /> {t("result.pb")}
              </div>
            ) : null}
          </div>
          <div className="min-w-0 self-center">
            <ResultChart wpm={result.wpmHistory} raw={result.rawHistory} errors={result.errorHistory} />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-start gap-x-12 gap-y-4">
          <div className="min-w-0">
            <div className="text-sm leading-tight text-sub">{t("result.testType")}</div>
            <div className="text-[1rem] leading-snug text-main">
              {typeLabel}
              <br />
              {languageInfo(spec.language).label.toLowerCase()}
              {spec.punctuation ? <><br />{t("config.punctuation")}</> : null}
              {spec.numbers ? <><br />{t("config.numbers")}</> : null}
            </div>
          </div>
          <Stat label={t("result.raw")} value={Math.round(result.raw)} title={`${result.raw.toFixed(2)}`} />
          <Stat
            label={t("result.characters")}
            value={`${correct}/${c.incorrectChars}/${c.extraChars}/${c.missedChars}`}
            title={t("result.charsTip")}
          />
          <Stat label={t("result.consistency")} value={`${Math.round(result.consistency)}%`} title={`${result.consistency.toFixed(2)}%`} />
          <Stat label={t("result.time")} value={`${Math.round(result.duration)}s`} title={`${result.duration.toFixed(2)}s · afk ${result.afkSeconds}s`} />
          {spec.quote ? (
            <div className="min-w-0 max-w-sm">
              <div className="text-sm leading-tight text-sub">{t("result.source")}</div>
              <div className="text-[0.95rem] leading-snug text-main">
                {spec.quote.author}
                <span className="text-sub"> — {spec.quote.source}</span>
              </div>
            </div>
          ) : null}
        </div>
        {failed ? (
          <div className="mt-5 text-sm text-error">
            {result.failed ? t("result.failed") : t("result.invalid")}:{" "}
            {result.failed === "min_wpm"
              ? t("result.failedMinWpm")
              : result.failed === "min_acc"
                ? t("result.failedMinAcc")
                : result.invalid === "afk"
                  ? t("result.afk")
                  : t("result.tooShort")}
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex items-center justify-center gap-2">
        <IconButton label={t("result.next")} onClick={onNext}>
          <ChevronRightIcon size={22} />
        </IconButton>
        <IconButton label={t("result.repeat")} onClick={onRepeat}>
          <RepeatIcon size={19} />
        </IconButton>
        <IconButton label={t("result.practice")} onClick={onPractice} disabled={result.missedWords.length === 0}>
          <TargetIcon size={19} />
        </IconButton>
        <IconButton label={t("result.screenshot")} onClick={screenshot}>
          <ImageIcon size={19} />
        </IconButton>
      </div>

      <div className="mt-6 min-h-6 text-center text-sm">
        {!signedIn && !failed ? (
          <Link href="/login" className="text-sub underline decoration-sub/50 underline-offset-4 hover:text-text">
            {t("result.signIn")}
          </Link>
        ) : (
          <span className={saveState === "failed" || saveState === "rejected" ? "text-error" : "text-sub"}>{saveText[saveState]}</span>
        )}
      </div>
      {toast ? (
        <div className="fade-in fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-sub-alt px-4 py-2.5 text-sm text-text shadow-lg">{toast}</div>
      ) : null}
    </div>
  );
}

function IconButton({ label, onClick, children, disabled, autoFocus }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; autoFocus?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className="text-btn grid h-12 w-16 place-items-center rounded-lg focus-visible:bg-sub-alt disabled:opacity-40"
    >
      {children}
    </button>
  );
}
