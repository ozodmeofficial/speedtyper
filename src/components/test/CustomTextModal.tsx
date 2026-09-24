"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/providers/I18nProvider";
import { CUSTOM_TEXT_STORAGE } from "@/lib/settings";

export function CustomTextModal({ onClose, onApply }: { onClose: () => void; onApply: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const [shuffle, setShuffle] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      setText(localStorage.getItem(CUSTOM_TEXT_STORAGE) ?? "");
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => ref.current?.focus());
  }, []);

  const apply = () => {
    let words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (shuffle) {
      for (let i = words.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [words[i], words[j]] = [words[j], words[i]];
      }
    }
    words = words.slice(0, 2000);
    try {
      localStorage.setItem(CUSTOM_TEXT_STORAGE, words.join(" "));
    } catch {
      /* ignore */
    }
    onApply();
  };

  return (
    <div
      className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
      data-modal-open
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) apply();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="custom-title" className="w-full max-w-2xl rounded-lg bg-bg p-6 shadow-2xl ring-1 ring-sub-alt">
        <h2 id="custom-title" className="mb-4 text-lg text-sub">
          {t("custom.title")}
        </h2>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("custom.placeholder")}
          rows={8}
          maxLength={20000}
          className="input resize-y font-typing"
          spellCheck={false}
        />
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-sub">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="accent-[var(--main)]" />
          {t("custom.shuffle")}
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            {t("custom.cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={apply}>
            {t("custom.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
