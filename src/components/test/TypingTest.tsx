"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { useT } from "@/components/providers/I18nProvider";
import { GlobeIcon, RestartIcon } from "@/components/ui/icons";
import { ConfigBar } from "./ConfigBar";
import { TypingSurface } from "./TypingSurface";
import {
  buildTestWords,
  makeEngine,
  makeSpec,
  practiceWords,
  quoteLanguageOf,
  testSignature,
  type InitialTest,
  type TestSpec,
} from "./testSetup";
import type { FinalResult, SaveState } from "./ResultView";
import type { TypingEngine } from "@/lib/typing/engine";
import { loadQuotes, loadWords, quotesIfLoaded, wordsIfLoaded } from "@/lib/client/wordlists";
import { CUSTOM_TEXT_STORAGE } from "@/lib/settings";
import { languageInfo } from "@/lib/typing/words";
import { api } from "@/lib/client/api";
import { nextStreak, effectiveStreak, testXp, type XpAward } from "@/lib/xp";
import { dayKey } from "@/lib/format";
import { AnimatedNumber } from "@/components/xp/AnimatedNumber";
import { FlameIcon } from "@/components/xp/Badges";
import { AgainButton, GoalPill, LevelStrip, LiveStats, ProgressRow, Widgets } from "./Dashboard";
import { BOARD_LANGS, BOARD_TIMES } from "@/lib/anticheat";

const ResultView = dynamic(() => import("./ResultView").then((m) => m.ResultView), { ssr: false });
const CustomTextModal = dynamic(() => import("./CustomTextModal").then((m) => m.CustomTextModal), { ssr: false });

interface Test {
  spec: TestSpec;
  engine: TypingEngine;
}

interface Live {
  second: number;
  wpm: number;
  acc: number;
  typed: number;
  /** completed words typed correctly */
  correct: number;
  /** correct words in a row (up to the last completed word) */
  combo: number;
}

const LIVE0: Live = { second: 0, wpm: 0, acc: 100, typed: 0, correct: 0, combo: 0 };

const PB_KEY = "st_pbs";
const CHALLENGE_KEY = "st_challenge";

interface Challenge {
  day: number;
  target: number;
  best: number;
}

/** Today's challenge: a speed target derived from the local personal bests, fixed for the day. */
function readChallenge(): Challenge {
  const today = dayKey();
  try {
    const c = JSON.parse(localStorage.getItem(CHALLENGE_KEY) ?? "null") as Challenge | null;
    if (c && c.day === today && typeof c.target === "number" && typeof c.best === "number") return c;
    const pbs = Object.values(JSON.parse(localStorage.getItem(PB_KEY) ?? "{}") as Record<string, number>).filter((n) => typeof n === "number");
    const pb = pbs.length ? Math.max(...pbs) : 0;
    const target = pb > 0 ? Math.min(250, Math.max(30, Math.round((pb * 0.9) / 5) * 5)) : 40;
    const next = { day: today, target, best: 0 };
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return { day: today, target: 40, best: 0 };
  }
}

function bumpChallenge(wpm: number): Challenge {
  const c = readChallenge();
  const next = { ...c, best: Math.max(c.best, wpm) };
  try {
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
const GUEST_DAILY_KEY = "st_guest_daily";

interface GuestDaily {
  day: number;
  count: number;
  streak: number;
  best: number;
  last: number | null;
}

function readGuestDaily(): GuestDaily {
  try {
    const v = JSON.parse(localStorage.getItem(GUEST_DAILY_KEY) ?? "null") as GuestDaily | null;
    if (v && typeof v.day === "number") return v;
  } catch {
    /* ignore */
  }
  return { day: 0, count: 0, streak: 0, best: 0, last: null };
}

/** Guests keep "tests today" and the daily streak locally. */
function bumpGuestDaily(): GuestDaily {
  const today = dayKey();
  const g = readGuestDaily();
  const st = nextStreak({ current: g.streak, best: g.best, lastDay: g.last }, today);
  const next: GuestDaily = { day: today, count: g.day === today ? g.count + 1 : 1, streak: st.current, best: st.best, last: st.lastDay };
  try {
    localStorage.setItem(GUEST_DAILY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
const pbKey = (s: TestSpec) => `${s.mode}|${s.mode2}|${s.language}|${s.punctuation ? 1 : 0}|${s.numbers ? 1 : 0}`;

function readCustomText(): string {
  try {
    return localStorage.getItem(CUSTOM_TEXT_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function TypingTest({ initial }: { initial: InitialTest | null }) {
  const { settings, update, user, progress, setProgress } = useApp();
  const t = useT();
  const signature = testSignature(settings);
  const idRef = useRef(1);

  const [test, setTest] = useState<Test | null>(() => {
    if (!initial || initial.signature !== signature) return null;
    const spec = makeSpec(1, settings, initial.words, initial.quote);
    return { spec, engine: makeEngine(spec, settings, () => wordsIfLoaded(settings.language)) };
  });
  const [phase, setPhase] = useState<"test" | "result">("test");
  const [result, setResult] = useState<FinalResult | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isPb, setIsPb] = useState(false);
  const [xpAward, setXpAward] = useState<XpAward | null>(null);
  const [guestXp, setGuestXp] = useState<number | null>(null);
  const [guestDaily, setGuestDaily] = useState<GuestDaily | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [live, setLive] = useState<Live>(LIVE0);
  const [last, setLast] = useState<{ wpm: number; acc: number } | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [started, setStarted] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [emptyCustom, setEmptyCustom] = useState(false);
  const testRef = useRef(test);
  testRef.current = test;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lastSignature = useRef(test ? signature : "");
  const restarts = useRef(0);
  const incomplete = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTyping = (on: boolean) => {
    if (on) document.body.dataset.typing = "1";
    else delete document.body.dataset.typing;
  };

  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Create a new test. `repeat` reuses the current words, `practice` uses given words. */
  const newTest = useCallback(async (opts: { repeat?: boolean; practice?: string[] } = {}) => {
    stopTimer();
    setTyping(false);
    const s = settingsRef.current;
    const prev = testRef.current;
    if (prev && prev.engine.started && !prev.engine.finished) {
      restarts.current++;
      incomplete.current += prev.engine.elapsed(performance.now());
    }
    let words: string[];
    let quote = null;
    let practice = false;
    if (opts.practice && opts.practice.length) {
      words = opts.practice;
      practice = true;
    } else if (opts.repeat && prev) {
      words = prev.engine.mode === "zen" ? [] : prev.engine.words.slice(0, prev.spec.mode === "time" ? undefined : prev.spec.words.length);
      quote = prev.spec.quote;
      practice = prev.spec.practice;
    } else {
      const lang = s.language;
      const qlang = quoteLanguageOf(lang);
      let list = wordsIfLoaded(lang);
      let quotes = quotesIfLoaded(qlang);
      if ((s.mode === "time" || s.mode === "words") && !list) list = await loadWords(lang);
      if (s.mode === "quote" && !quotes) quotes = await loadQuotes(qlang);
      const built = buildTestWords(s, list, quotes, readCustomText(), prev?.spec.quote?.id);
      if (!built) return;
      words = built.words;
      quote = built.quote;
    }
    if (settingsRef.current !== s && testSignature(settingsRef.current) !== testSignature(s)) return; // superseded
    const cur = settingsRef.current;
    setEmptyCustom(cur.mode === "custom" && !practice && words.length === 0);
    const spec = practice ? makeSpec(++idRef.current, cur, words, null, true) : makeSpec(++idRef.current, cur, words, quote);
    const engine = makeEngine(spec, cur, () => wordsIfLoaded(cur.language));
    lastSignature.current = testSignature(cur);
    setTest({ spec, engine });
    setPhase("test");
    setResult(null);
    setSaveState("idle");
    setIsPb(false);
    setXpAward(null);
    setGuestXp(null);
    setStarted(false);
    setLive(LIVE0);
  }, []);

  // first test when SSR had none, and a new test whenever test-relevant settings change
  useEffect(() => {
    if (!test || lastSignature.current !== signature) void newTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // preload the current language's lists (restart must be instant)
  useEffect(() => {
    void loadWords(settings.language);
    if (settings.mode === "quote") void loadQuotes(quoteLanguageOf(settings.language));
    void import("./ResultView");
  }, [settings.language, settings.mode]);

  // live engine options
  useEffect(() => {
    if (!test) return;
    test.engine.freedom = settings.freedomMode;
    test.engine.confidence = settings.confidenceMode;
  }, [test, settings.freedomMode, settings.confidenceMode]);

  // guests: local "tests today" / streak
  useEffect(() => {
    if (!user) setGuestDaily(readGuestDaily());
    setChallenge(readChallenge());
  }, [user]);

  // show chrome again when the mouse moves
  useEffect(() => {
    const onMove = () => setTyping(false);
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      setTyping(false);
      stopTimer();
    };
  }, []);

  const finish = useCallback(
    (failed: FinalResult["failed"] = null) => {
      const cur = testRef.current;
      if (!cur) return;
      stopTimer();
      setTyping(false);
      const { engine, spec } = cur;
      if (!engine.finished) engine.finish(performance.now());
      const r = engine.result();
      let invalid: FinalResult["invalid"] = null;
      if (!failed) {
        if (r.duration < 3 || (spec.mode === "zen" && r.wordsTyped === 0)) invalid = "too_short";
        else if (r.duration > 10 && r.afkSeconds > r.duration * 0.5) invalid = "afk";
      }
      const final: FinalResult = { ...r, failed, invalid };
      setResult(final);
      setPhase("result");

      if (!failed && !invalid) {
        setLast({ wpm: r.wpm, acc: r.acc });
        if (!spec.practice) setChallenge(bumpChallenge(r.wpm));
      }
      if (failed || invalid || spec.practice) {
        setSaveState(user ? "idle" : "guest");
        return;
      }
      // guest PBs are kept locally
      let localPb = false;
      try {
        const pbs = JSON.parse(localStorage.getItem(PB_KEY) ?? "{}") as Record<string, number>;
        const k = pbKey(spec);
        if (!(k in pbs) || r.wpm > pbs[k]) {
          localPb = k in pbs;
          pbs[k] = r.wpm;
          localStorage.setItem(PB_KEY, JSON.stringify(pbs));
        }
      } catch {
        /* ignore */
      }
      if (!user) {
        setIsPb(localPb);
        setSaveState("guest");
        setGuestXp(testXp(r));
        setGuestDaily(bumpGuestDaily());
        return;
      }
      setSaveState("saving");
      const payload = {
        mode: spec.mode,
        mode2: spec.mode2,
        language: spec.language,
        punctuation: spec.punctuation,
        numbers: spec.numbers,
        wpm: r.wpm,
        raw: r.raw,
        acc: r.acc,
        consistency: r.consistency,
        chars: {
          correctWord: r.counts.correctWordChars,
          correct: r.counts.correctChars,
          incorrect: r.counts.incorrectChars,
          extra: r.counts.extraChars,
          missed: r.counts.missedChars,
          spaces: r.counts.spaces,
          correctSpaces: r.counts.correctSpaces,
        },
        duration: r.duration,
        wpmHistory: r.wpmHistory,
        rawHistory: r.rawHistory,
        errorHistory: r.errorHistory,
        keySpacing: r.keySpacing,
        afkSeconds: r.afkSeconds,
        restarts: restarts.current,
        incompleteTime: Math.round(incomplete.current * 100) / 100,
      };
      restarts.current = 0;
      incomplete.current = 0;
      void api<{ ok?: boolean; isPb?: boolean; error?: string; xp?: XpAward | null; todayTests?: number }>("/api/results", { body: payload }).then((res) => {
        if (res.ok) {
          const award = res.data.xp ?? null;
          const prev = progressRef.current;
          if (award) {
            setProgress({
              xp: award.xp,
              level: award.level,
              streak: award.streak,
              streakBest: award.streakBest,
              streakToday: true,
              today: dayKey(),
              todayTests: res.data.todayTests ?? (prev?.todayTests ?? 0) + 1,
            });
          } else if (prev && typeof res.data.todayTests === "number") {
            setProgress({ ...prev, todayTests: res.data.todayTests });
          }
          if (testRef.current !== cur) return;
          setSaveState("saved");
          setIsPb(!!res.data.isPb);
          setXpAward(award);
        } else if (testRef.current === cur) setSaveState(res.status === 422 ? "rejected" : "failed");
      });
    },
    [user, setProgress],
  );

  const startTimer = useCallback(() => {
    const cur = testRef.current;
    if (!cur) return;
    const { engine } = cur;
    let last = 0;
    const step = () => {
      if (engine.finished || testRef.current?.engine !== engine) return;
      const now = performance.now();
      const second = Math.floor((now - engine.startedAt) / 1000);
      if (second > last) {
        last = second;
        const ended = engine.tick(second);
        if (ended) return finish(null);
        const wpm = engine.liveWpm(now);
        const acc = engine.liveAcc();
        setLive((l) => ({ ...l, second, wpm, acc }));
        const s = settingsRef.current;
        if (s.minWpm > 0 && second >= 3 && wpm < s.minWpm) return finish("min_wpm");
        if (s.minAcc > 0 && second >= 1 && acc < s.minAcc) return finish("min_acc");
      }
      const nextAt = engine.startedAt + (last + 1) * 1000;
      timer.current = setTimeout(step, Math.max(0, nextAt - performance.now()));
    };
    timer.current = setTimeout(step, Math.max(0, engine.startedAt + 1000 - performance.now()));
  }, [finish]);

  const onChange = useCallback(
    (_kind: "insert" | "delete", finished: boolean) => {
      const cur = testRef.current;
      if (!cur) return;
      const { engine } = cur;
      if (engine.started && !started) {
        setStarted(true);
        startTimer();
      }
      if (engine.started) setTyping(true);
      let correct = 0;
      let combo = 0;
      if (engine.mode === "zen") correct = combo = engine.index;
      else
        for (let i = 0; i < engine.index; i++) {
          const ok = engine.inputs[i] === engine.words[i];
          if (ok) correct++;
          combo = ok ? combo + 1 : 0;
        }
      setLive((l) => ({ ...l, acc: engine.liveAcc(), typed: engine.index, correct, combo }));
      if (finished) finish(null);
    },
    [started, startTimer, finish],
  );

  // keyboard shortcuts on the result screen
  useEffect(() => {
    if (phase !== "result") return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("[data-modal-open]")) return;
      const qr = settingsRef.current.quickRestart;
      if ((e.key === "Tab" && qr === "tab") || (e.key === "Escape" && qr === "esc") || (e.key === "Enter" && qr === "enter" && document.activeElement === document.body)) {
        e.preventDefault();
        void newTest();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, newTest]);

  const spec = test?.spec;
  const engine = test?.engine;
  const showStats = started && phase === "test";
  const timeLeft = spec && spec.mode === "time" ? spec.timeLimit - live.second : 0;
  const progressText = spec
    ? spec.mode === "time"
      ? String(Math.max(0, timeLeft))
      : spec.mode === "zen"
        ? String(live.typed)
        : `${live.typed}/${spec.words.length}`
    : "";
  const progressFrac = spec
    ? spec.mode === "time"
      ? live.second / Math.max(1, spec.timeLimit)
      : spec.words.length
        ? live.typed / spec.words.length
        : 0
    : 0;

  const dash = settings.dashboard;
  const today = dayKey();
  const streak = user ? (progress?.streak ?? 0) : guestDaily ? effectiveStreak({ current: guestDaily.streak, best: guestDaily.best, lastDay: guestDaily.last }, today) : 0;
  const streakSafe = user ? !!progress?.streakToday : guestDaily?.last === today;
  const todayTests = user ? (progress?.today === today ? progress.todayTests : 0) : guestDaily?.day === today ? guestDaily.count : 0;
  const dailyReady = user ? !!progress : guestDaily !== null;
  const board = {
    time: settings.mode === "time" && (BOARD_TIMES as readonly string[]).includes(String(settings.time)) ? String(settings.time) : "60",
    lang: (BOARD_LANGS as readonly string[]).includes(settings.language) ? settings.language : "english",
  };
  const liveXp = started && live.second >= 3 ? testXp({ duration: live.second, wpm: live.wpm, acc: live.acc }) : 0;

  const languageButton = (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const ids = ["english", "english_1k", "uzbek", "russian"] as const;
        const i = ids.indexOf(settings.language);
        update({ language: ids[(i + 1) % ids.length] });
      }}
      title={t("test.language")}
      className="text-btn flex items-center gap-2 rounded-full px-3 py-1 text-sm hover:bg-[var(--hover)]"
    >
      <GlobeIcon size={15} />
      {languageInfo(settings.language).label.toLowerCase()}
    </button>
  );

  const surface =
    engine && spec ? (
      emptyCustom ? (
        <div className="grid h-[4.5em] place-items-center text-sub" style={{ fontSize: "var(--font-size)" }}>
          <span className="font-sans text-base">{t("test.customEmpty")}</span>
        </div>
      ) : (
        <TypingSurface
          key={spec.id}
          engine={engine}
          settings={settings}
          onChange={onChange}
          onRestart={() => void newTest()}
          onZenFinish={() => finish(null)}
          effects={settings.effects}
          comboLabel={t("test.combo")}
        />
      )
    ) : (
      <div className="words-wrap">
        <div className="words-clip" />
      </div>
    );

  return (
    <div className="relative flex flex-1 flex-col">
      {settings.timerStyle === "bar" && showStats ? (
        <div className="fixed top-0 left-0 z-40 h-1.5 bg-main transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (spec?.mode === "time" ? (live.second + 1) / Math.max(1, spec.timeLimit) : progressFrac) * 100)}%` }} />
      ) : null}

      {dash && phase === "test" ? (
        <div className="chrome pt-1">
          <LevelStrip progress={user ? progress : null} signedIn={!!user} streak={streak} streakSafe={streakSafe} />
        </div>
      ) : null}

      <div className={`chrome ${dash ? "pt-4" : "pt-2"} ${phase === "result" ? (dash ? "hidden" : "invisible") : ""}`}>
        <ConfigBar settings={settings} update={update} onCustom={() => setCustomOpen(true)} />
      </div>

      <div className={`flex flex-1 flex-col ${dash && phase === "test" ? "pt-7 pb-6" : "justify-center py-10"}`}>
        {phase === "result" && result && spec ? (
          <ResultView
            result={result}
            spec={spec}
            isPb={isPb}
            saveState={saveState}
            signedIn={!!user}
            effects={settings.effects}
            xp={xpAward}
            guestXp={guestXp}
            onNext={() => void newTest()}
            onRepeat={() => void newTest({ repeat: true })}
            onPractice={() => void newTest({ practice: practiceWords(result.missedWords) })}
          />
        ) : dash ? (
          <div className="dash relative mx-auto w-full max-w-[72rem]">
            <div className="chrome mb-3 flex justify-center">{languageButton}</div>
            <div className="px-1 sm:px-4">{surface}</div>
            <div className="mt-9">
              <LiveStats wpm={live.wpm} acc={live.acc} combo={live.combo} correct={live.correct} xp={liveXp} started={showStats} last={last} effects={settings.effects} />
              {settings.timerStyle !== "off" && spec ? (
                <ProgressRow
                  frac={spec.mode === "time" ? (showStats ? (live.second + 1) / Math.max(1, spec.timeLimit) : 0) : progressFrac}
                  done={spec.mode === "time" ? live.second : live.typed}
                  total={spec.mode === "time" ? spec.timeLimit : spec.mode === "zen" ? 0 : spec.words.length}
                  time={spec.mode === "time"}
                />
              ) : null}
            </div>
            <div className="chrome">
              {dailyReady ? <GoalPill today={todayTests} href={user ? `/u/${user.username}` : "/login"} /> : <div className="mt-6 h-11" aria-hidden="true" />}
              <Widgets progress={user ? progress : null} username={user?.username ?? null} challenge={challenge ?? { target: 40, best: 0 }} board={board} />
              <AgainButton onClick={() => void newTest()} />
            </div>
          </div>
        ) : (
          <div className="relative mx-auto w-full">
            <div className="chrome mb-4 flex justify-center">{languageButton}</div>
            <div className="mb-2 flex h-[calc(var(--font-size)*1.2)] items-end gap-[1.2em] font-typing text-main" style={{ fontSize: "calc(var(--font-size) * 1.05)" }} aria-live="off">
              <span className={`tabular transition-opacity duration-150 ${showStats && settings.timerStyle === "text" ? "opacity-100" : "opacity-0"}`}>{progressText}</span>
              {settings.liveWpm ? (
                <span className={`tabular transition-opacity duration-150 ${showStats ? "opacity-60" : "opacity-0"}`}>
                  <AnimatedNumber value={Math.round(live.wpm)} duration={600} animate={settings.effects} />
                </span>
              ) : null}
              {settings.liveAcc ? <span className={`tabular transition-opacity duration-150 ${showStats ? "opacity-60" : "opacity-0"}`}>{Math.floor(live.acc)}%</span> : null}
            </div>
            {surface}
            <div className="chrome mt-8 flex justify-center">
              <button type="button" onClick={() => void newTest()} title={t("test.restart")} aria-label={t("test.restart")} className="text-btn grid h-11 w-14 place-items-center rounded-lg focus-visible:bg-sub-alt focus-visible:text-text">
                <RestartIcon size={19} />
              </button>
            </div>
            <DailyLine streak={streak} safe={streakSafe} today={todayTests} ready={dailyReady} />
          </div>
        )}
      </div>

      {settings.showKeyTips ? (
        <div className="chrome flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pb-3 text-xs text-sub">
          {settings.quickRestart !== "off" ? (
            <span className="hint">
              <kbd>{settings.quickRestart}</kbd> {t("test.hintRestart")}
            </span>
          ) : null}
          {spec?.mode === "zen" ? (
            <>
              <span className="h-4 w-px bg-line" aria-hidden="true" />
              <span className="hint">
                <kbd>shift</kbd>+<kbd>enter</kbd> {t("test.hintZen")}
              </span>
            </>
          ) : null}
          <span className="h-4 w-px bg-line" aria-hidden="true" />
          <span className="hint">
            {settings.quickRestart !== "esc" ? <kbd>esc</kbd> : null}
            <kbd>ctrl</kbd>+<kbd>k</kbd> {t("test.hintPalette")}
          </span>
        </div>
      ) : null}

      {customOpen ? (
        <CustomTextModal
          onClose={() => setCustomOpen(false)}
          onApply={() => {
            setCustomOpen(false);
            if (settingsRef.current.mode !== "custom") update({ mode: "custom" });
            else void newTest();
          }}
        />
      ) : null}
    </div>
  );
}

function DailyLine({ streak, safe, today, ready }: { streak: number; safe: boolean; today: number; ready: boolean }) {
  const t = useT();
  if (!ready) return <div className="chrome mt-5 h-5" aria-hidden="true" />;
  if (streak === 0) {
    return (
      <div className="chrome mt-5">
        <div className="fade-in flex h-5 items-center justify-center gap-1.5 text-xs text-sub">
          <FlameIcon size={13} className="opacity-60" />
          {t("streak.start")}
        </div>
      </div>
    );
  }
  return (
    <div className="chrome mt-5">
    <div className="fade-in flex h-5 items-center justify-center gap-3 text-xs text-sub">
      <span className={`flex items-center gap-1.5 ${safe ? "text-main" : ""}`} title={safe ? t("streak.safe") : t("streak.keep")}>
        <FlameIcon size={13} />
        {t("streak.daysLong", { n: streak })}
      </span>
      <span className="h-1 w-1 rounded-full bg-sub/60" aria-hidden="true" />
      <span className="tabular">{today > 0 ? t("today.tests", { n: today }) : t("today.none")}</span>
      {streak > 0 && !safe ? (
        <>
          <span className="h-1 w-1 rounded-full bg-sub/60" aria-hidden="true" />
          <span>{t("streak.keep")}</span>
        </>
      ) : null}
    </div>
    </div>
  );
}
