"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TypingEngine } from "@/lib/typing/engine";
import type { Settings } from "@/lib/settings";
import { playKey } from "@/lib/client/sound";
import { useT } from "@/components/providers/I18nProvider";
import { prefersReducedMotion } from "@/lib/client/motion";

const RENDER_AHEAD = 140;
const SENTINEL = " ";

interface WordProps {
  word: string;
  input: string | null;
  active: boolean;
  blind: boolean;
  index: number;
}

/** One word. Future words are a single text node; typed words get per-letter spans. */
const Word = memo(function Word({ word, input, active, blind, index }: WordProps) {
  if (input === null && !active) {
    return (
      <div className="word" data-i={index}>
        {word}
      </div>
    );
  }
  const typed = input ?? "";
  const letters: React.ReactNode[] = [];
  const len = Math.max(word.length, typed.length);
  for (let i = 0; i < len; i++) {
    if (i < word.length) {
      const t = typed[i];
      const cls = t === undefined ? undefined : t === word[i] ? "c" : "i";
      letters.push(
        <span key={i} className={cls}>
          {word[i]}
        </span>,
      );
    } else {
      letters.push(
        <span key={i} className="x">
          {typed[i]}
        </span>,
      );
    }
  }
  const err = !active && !blind && typed !== word;
  return (
    <div className={`word${err ? " err" : ""}${blind ? " blind" : ""}`} data-i={index}>
      {letters}
    </div>
  );
});

export interface TypingSurfaceProps {
  engine: TypingEngine;
  settings: Settings;
  disabled?: boolean;
  autoFocus?: boolean;
  /** called after every change of the engine state */
  onChange?: (kind: "insert" | "delete", finished: boolean) => void;
  onRestart?: () => void;
  onZenFinish?: () => void;
  /** show caps-lock hint etc. */
  className?: string;
  /** caret glow, completed-word flash and the combo counter */
  effects?: boolean;
  /** tooltip of the combo counter */
  comboLabel?: string;
}

const FLASH_POOL = 3;
const MILESTONES = new Set([10, 25, 50, 75, 100]);

export function TypingSurface({ engine, settings, disabled, autoFocus = true, onChange, onRestart, onZenFinish, className, effects = false, comboLabel }: TypingSurfaceProps) {
  const t = useT();
  const [, setVersion] = useState(0);
  const [firstIndex, setFirstIndex] = useState(0);
  const [focused, setFocused] = useState(true);
  const [showBlur, setShowBlur] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const lastCaret = useRef({ x: 0, y: 0 });
  const tapeOffset = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // effects state lives in refs: the DOM is updated directly, never via React state
  const flashRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flashNext = useRef(0);
  const pendingFlash = useRef<{ i: number; ok: boolean } | null>(null);
  const prevIndex = useRef(engine.index);
  const committedUpTo = useRef(engine.index);
  const combo = useRef(0);
  const comboRef = useRef<HTMLDivElement>(null);
  const comboNRef = useRef<HTMLSpanElement>(null);
  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = prefersReducedMotion();
  }, []);

  engine.minIndex = firstIndex;

  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  const focus = useCallback(() => {
    const el = inputRef.current;
    if (!el || disabled) return;
    el.focus({ preventScroll: true });
    el.value = SENTINEL;
    el.setSelectionRange(1, 1);
  }, [disabled]);

  useEffect(() => {
    if (autoFocus) focus();
  }, [autoFocus, focus]);

  // blur overlay appears with a small delay to avoid flicker on quick focus changes
  useEffect(() => {
    if (focused || disabled) {
      setShowBlur(false);
      return;
    }
    const id = setTimeout(() => setShowBlur(true), 450);
    return () => clearTimeout(id);
  }, [focused, disabled]);

  // any printable key while unfocused focuses the test (like the popular typing sites)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled || e.defaultPrevented) return;
      if (document.activeElement === inputRef.current) return;
      if (document.querySelector("[data-modal-open]")) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length === 1 && e.key !== " ") {
        focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, focus]);

  const apply = useCallback(
    (text: string) => {
      if (disabled || engine.finished) return;
      const now = performance.now();
      let finished = false;
      const s = settingsRef.current;
      for (const ch of text) {
        if (ch === "\n" || ch === "\r" || ch === "\t") continue;
        const before = engine.incorrectKeys;
        finished = engine.insert(ch, now) || finished;
        if (s.sound !== "off") playKey(s.sound, s.soundVolume, engine.incorrectKeys > before);
        if (finished) break;
      }
      rerender();
      onChangeRef.current?.("insert", finished);
    },
    [disabled, engine, rerender],
  );

  const del = useCallback(
    (word: boolean) => {
      if (disabled || engine.finished) return;
      if (engine.backspace(performance.now(), word)) {
        const s = settingsRef.current;
        if (s.sound !== "off") playKey(s.sound, s.soundVolume * 0.7);
        rerender();
        onChangeRef.current?.("delete", false);
      }
    },
    [disabled, engine, rerender],
  );

  const reset = () => {
    const el = inputRef.current;
    if (!el) return;
    el.value = SENTINEL;
    el.setSelectionRange(1, 1);
  };

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    if (composing.current) return;
    const el = e.currentTarget;
    const ne = e.nativeEvent as InputEvent;
    const value = el.value;
    if (ne.inputType === "deleteWordBackward" || ne.inputType === "deleteSoftLineBackward" || ne.inputType === "deleteHardLineBackward") {
      del(true);
    } else if (value.length < SENTINEL.length || ne.inputType === "deleteContentBackward") {
      del(false);
    } else if (value.startsWith(SENTINEL)) {
      const added = value.slice(SENTINEL.length);
      if (added) apply(added);
    } else if (value.endsWith(SENTINEL)) {
      // caret was in front of the sentinel
      apply(value.slice(0, -SENTINEL.length));
    } else if (value) {
      apply(value);
    }
    reset();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
    const qr = settingsRef.current.quickRestart;
    if (e.key === "Tab") {
      if (qr === "tab" && onRestart) {
        e.preventDefault();
        onRestart();
      }
      return;
    }
    if (e.key === "Escape" && qr === "esc" && onRestart) {
      e.preventDefault();
      onRestart();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey && engine.mode === "zen" && onZenFinish) onZenFinish();
      else if (qr === "enter" && onRestart) onRestart();
      return;
    }
    // Backspace with the sentinel removed by the browser is handled in onInput;
    // handle it here too when the input is already empty (some IMEs).
    if (e.key === "Backspace" && inputRef.current && (inputRef.current.value.length === 0 || inputRef.current.selectionEnd === 0)) {
      e.preventDefault();
      del(e.ctrlKey || e.altKey || e.metaKey);
      reset();
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Home" || e.key === "End")) {
      e.preventDefault();
    }
  };

  // --- layout: hide completed lines, position caret, tape mode ---
  // Runs after every render on purpose (measurements depend on the DOM); the
  // setFirstIndex call converges after one extra render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const wordsEl = wordsRef.current;
    const clip = clipRef.current;
    const caret = caretRef.current;
    if (!wordsEl || !clip || !caret) return;
    // effects: detect a freshly committed word (flash + combo)
    const idx = engine.index;
    const prev = prevIndex.current;
    prevIndex.current = idx;
    if (effects && engine.mode !== "zen" && idx === prev + 1 && prev >= committedUpTo.current) {
      committedUpTo.current = idx;
      const ok = engine.inputs[prev] === engine.words[prev];
      updateCombo(ok);
      if (!reduced.current) pendingFlash.current = { i: prev, ok };
    }

    const active = wordsEl.querySelector<HTMLElement>(`[data-i="${engine.index}"]`);
    if (!active) return;
    const em = parseFloat(getComputedStyle(wordsEl).fontSize) || 24;
    const lineH = em * 1.5;
    const tape = settings.tapeMode;

    if (!tape && active.offsetTop >= lineH * 2 - 2) {
      // drop the first visible line
      let next = firstIndex;
      for (const child of Array.from(wordsEl.children) as HTMLElement[]) {
        const i = Number(child.dataset.i);
        if (Number.isNaN(i)) continue;
        if (child.offsetTop >= lineH - 2) {
          next = i;
          break;
        }
      }
      if (next !== firstIndex) {
        setFirstIndex(next);
        return;
      }
    }

    // reads for the pending flash happen before any style writes below (no layout thrash)
    let flash: { el: HTMLDivElement; ok: boolean; x: number; y: number; w: number; h: number } | null = null;
    const pf = pendingFlash.current;
    pendingFlash.current = null;
    if (pf) {
      const wEl = wordsEl.querySelector<HTMLElement>(`[data-i="${pf.i}"]`);
      const el = flashRefs.current[flashNext.current++ % FLASH_POOL];
      if (wEl && el) {
        const px = em * 0.16;
        const py = em * 0.14;
        flash = { el, ok: pf.ok, x: wEl.offsetLeft - px, y: wEl.offsetTop - py, w: wEl.offsetWidth + px * 2, h: wEl.offsetHeight + py * 2 };
      }
    }

    const letters = active.children;
    const n = engine.current.length;
    let x: number;
    let w = em * 0.6;
    if (n < letters.length) {
      const el = letters[n] as HTMLElement;
      x = active.offsetLeft + el.offsetLeft;
      w = el.offsetWidth || w;
    } else if (letters.length > 0) {
      const el = letters[letters.length - 1] as HTMLElement;
      x = active.offsetLeft + el.offsetLeft + el.offsetWidth;
    } else {
      x = active.offsetLeft;
    }
    const style = settings.caretStyle;
    const top = active.offsetTop;
    let cx = x;
    let cy = top + (em - em * 1.15) / 2;
    if (style === "line") cx = x - em * 0.04;
    if (style === "block" || style === "outline") cy = top + (em - em * 1.1) / 2;
    if (style === "underline") cy = top + em * 1.02;
    if (style === "block" || style === "outline" || style === "underline") caret.style.width = `${w}px`;
    else caret.style.width = "";

    if (tape) {
      const target = clip.clientWidth * 0.4;
      const offset = Math.max(0, x - target);
      tapeOffset.current = offset;
      wordsEl.style.transform = `translateX(${-offset}px)`;
    } else if (wordsEl.style.transform) {
      wordsEl.style.transform = "";
    }
    if (lastCaret.current.x !== cx || lastCaret.current.y !== cy) {
      caret.style.transform = `translate(${cx}px, ${cy}px)`;
      lastCaret.current = { x: cx, y: cy };
    }
    if (flash) {
      const { el, ok, x: fx, y: fy, w: fw, h: fh } = flash;
      el.getAnimations().forEach((a) => a.cancel());
      el.className = `word-flash ${ok ? "ok" : "bad"}`;
      el.style.width = `${fw}px`;
      el.style.height = `${fh}px`;
      const at = `translate(${fx}px, ${fy}px)`;
      el.animate(
        ok
          ? [
              { opacity: 0, transform: `${at} scale(0.94)` },
              { opacity: 1, transform: `${at} scale(1.03)`, offset: 0.3 },
              { opacity: 0, transform: `${at} scale(1)` },
            ]
          : [
              { opacity: 0, transform: at },
              { opacity: 0.9, transform: at, offset: 0.25 },
              { opacity: 0, transform: at },
            ],
        { duration: ok ? 480 : 620, easing: "ease-out" },
      );
    }
  });

  function updateCombo(ok: boolean) {
    combo.current = ok ? combo.current + 1 : 0;
    const box = comboRef.current;
    const num = comboNRef.current;
    if (!box || !num) return;
    const c = combo.current;
    if (c > 0) num.textContent = String(c);
    box.classList.toggle("show", c >= 3);
    if (!reduced.current && (MILESTONES.has(c) || (c > 100 && c % 50 === 0))) {
      num.animate(
        [
          { transform: "scale(1)", opacity: 1 },
          { transform: "scale(1.5)", opacity: 1, offset: 0.35 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration: 560, easing: "cubic-bezier(0.2, 1.4, 0.35, 1)" },
      );
      box.animate([{ filter: "none" }, { filter: "drop-shadow(0 0 6px var(--main))", offset: 0.35 }, { filter: "none" }], { duration: 700 });
    }
  }

  // re-measure on resize / font load
  useEffect(() => {
    const ro = new ResizeObserver(() => rerender());
    if (clipRef.current) ro.observe(clipRef.current);
    void document.fonts?.ready.then(() => rerender());
    return () => ro.disconnect();
  }, [rerender]);

  const words = engine.words;
  const end = Math.min(words.length, Math.max(engine.index + 1, firstIndex) + RENDER_AHEAD);
  const items: React.ReactNode[] = [];
  for (let i = firstIndex; i < end; i++) {
    const done = i < engine.index;
    const active = i === engine.index;
    items.push(
      <Word
        key={i}
        index={i}
        word={words[i]}
        input={done ? engine.inputs[i] ?? "" : active ? (engine.current.length > 0 || engine.started ? engine.current : null) : null}
        active={active}
        blind={settings.blindMode}
      />,
    );
  }

  const typingStarted = engine.started && !engine.finished;
  const caretCls = [
    "caret",
    settings.caretStyle,
    settings.smoothCaret ? "smooth" : "",
    !typingStarted ? "idle" : "",
    effects ? "glow" : "",
  ].join(" ");

  return (
    <div className={`words-wrap ${className ?? ""}`} onMouseDown={(e) => { if (!disabled) { e.preventDefault(); focus(); } }}>
      <textarea
        ref={inputRef}
        className="hidden-input"
        data-typing-input="1"
        aria-label="typing input"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        tabIndex={0}
        defaultValue={SENTINEL}
        disabled={disabled}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={(e) => {
          composing.current = false;
          const v = e.currentTarget.value;
          const added = v.startsWith(SENTINEL) ? v.slice(SENTINEL.length) : v;
          if (added) apply(added);
          reset();
        }}
        onFocus={() => {
          setFocused(true);
          reset();
        }}
        onBlur={() => setFocused(false)}
      />
      {effects ? (
        <div ref={comboRef} className="combo" aria-hidden="true" title={comboLabel}>
          <span className="combo-x">×</span>
          <span ref={comboNRef} className="combo-n">
            0
          </span>
        </div>
      ) : null}
      {capsLock && focused ? (
        <div className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 rounded-md bg-main px-3 py-1 font-sans text-xs text-bg">
          {t("test.capsLock")}
        </div>
      ) : null}
      <div ref={clipRef} className="words-clip" style={settings.tapeMode ? { height: "1.5em" } : undefined}>
        <div ref={wordsRef} className={`words${settings.tapeMode ? " tape" : ""}${showBlur ? " blurred" : ""}${effects ? " fx" : ""}`} style={{ position: "relative" }}>
          {items}
          {effects
            ? Array.from({ length: FLASH_POOL }, (_, i) => (
                <div
                  key={`fx${i}`}
                  aria-hidden="true"
                  className="word-flash"
                  ref={(el) => {
                    flashRefs.current[i] = el;
                  }}
                />
              ))
            : null}
          <div
            ref={caretRef}
            className={caretCls}
            aria-hidden="true"
            style={{
              transform: "translate(-0.04em, 0.175em)",
              display: settings.caretStyle === "off" || showBlur || engine.finished ? "none" : undefined,
            }}
          />
        </div>
      </div>
      {showBlur ? (
        <button type="button" className="focus-warning fade-in" onClick={focus}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m4 4 7 17 2.5-7.5L21 11 4 4Z" />
          </svg>
          {t("test.focus")}
        </button>
      ) : null}
    </div>
  );
}
