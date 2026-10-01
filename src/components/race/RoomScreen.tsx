"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { useT } from "@/components/providers/I18nProvider";
import { TypingSurface } from "@/components/test/TypingSurface";
import { CrownIcon, LinkIcon, UsersIcon, EyeIcon } from "@/components/ui/icons";
import { TypingEngine } from "@/lib/typing/engine";
import { PROGRESS_INTERVAL_MS, type ClientMsg } from "@/lib/race/protocol";
import { LOCAL_TUNING, rankMargin, rankStable, type ProgressSmoother } from "@/lib/race/smooth";
import { languageInfo } from "@/lib/typing/words";
import type { RacePlayer, RoomView } from "./useRace";
import type { DictKey } from "@/lib/i18n";

const MEDAL = ["#d4a017", "#a8b0bc", "#c07a3a"];
/** rooms with more players than this use the virtualized list */
const BIG_ROOM = 12;
/** at most one re-rank (and list reorder) per interval */
const RANK_INTERVAL_MS = 1000;

function useNow(active: boolean, interval = 100) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return now;
}

function Medal({ place, size = 20 }: { place: number; size?: number }) {
  if (place < 1) return null;
  if (place > 3) return <span className="text-xs text-sub tabular">#{place}</span>;
  return (
    <span
      className="rc-medal"
      style={{ background: MEDAL[place - 1], width: size, height: size, fontSize: size * 0.55 }}
      title={`#${place}`}
      aria-label={`#${place}`}
    >
      {place}
    </span>
  );
}

// ---------------------------------------------------------------------------
// rAF painter: eases every registered lane toward its latest server value and
// writes transform-only styles straight to the DOM (no React re-render per frame).
// ---------------------------------------------------------------------------

interface Painted {
  pid: number;
  root: HTMLElement;
  bar: HTMLElement | null;
  mover: HTMLElement | null;
  pct: HTMLElement | null;
  last: number;
}

function paint(p: Painted, v: number) {
  if (p.last === v) return;
  p.last = v;
  p.root.dataset.progress = v.toFixed(4);
  if (p.bar) p.bar.style.transform = `scaleX(${v})`;
  if (p.mover) p.mover.style.transform = `translateX(${(v * 100).toFixed(3)}%)`;
  if (p.pct) {
    const s = `${Math.floor(v * 100 + 1e-6)}%`;
    if (p.pct.textContent !== s) p.pct.textContent = s;
  }
}

function useLanePainter(smoother: ProgressSmoother) {
  const els = useRef(new Map<string, Painted>());
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      smoother.step(t - last);
      last = t;
      for (const p of els.current.values()) paint(p, smoother.shown(p.pid));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [smoother]);

  /** stable callback ref for a lane slot (`pid` may be shown in two slots: pinned + list) */
  return useCallback(
    (pid: number, slot: string) => {
      const key = `${slot}:${pid}`;
      let fn = refs.current.get(key);
      if (!fn) {
        fn = (el: HTMLElement | null) => {
          if (!el) {
            els.current.delete(key);
            return;
          }
          const p: Painted = {
            pid,
            root: el,
            bar: el.querySelector<HTMLElement>("[data-bar]"),
            mover: el.querySelector<HTMLElement>("[data-mover]"),
            pct: el.querySelector<HTMLElement>("[data-pct]"),
            last: -1,
          };
          els.current.set(key, p);
          paint(p, smoother.shown(pid));
        };
        refs.current.set(key, fn);
      }
      return fn;
    },
    [smoother],
  );
}

type LaneRef = (pid: number, slot: string) => (el: HTMLElement | null) => void;

// ---------------------------------------------------------------------------
// stable ranking with hysteresis
// ---------------------------------------------------------------------------

function useRanking(room: RoomView, smoother: ProgressSmoother): number[] {
  const players = Object.values(room.players);
  const joinOrder = useMemo(() => players.map((p) => p.pid).sort((a, b) => a - b), [players.map((p) => p.pid).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const finishedKey = players
    .filter((p) => p.place > 0)
    .map((p) => `${p.pid}:${p.place}`)
    .join(",");
  const [order, setOrder] = useState<number[]>(joinOrder);
  const prev = useRef<number[]>(joinOrder);
  const roomRef = useRef(room);
  roomRef.current = room;
  const racing = room.state === "racing" || room.state === "countdown";

  const compute = useCallback(() => {
    const r = roomRef.current;
    const inputs = Object.values(r.players).map((p) => ({ pid: p.pid, place: p.place, progress: p.place > 0 ? 1 : smoother.target(p.pid) }));
    const next = r.state === "waiting" ? inputs.map((p) => p.pid).sort((a, b) => a - b) : rankStable(prev.current, inputs, rankMargin(r.text.length));
    prev.current = next;
    setOrder((o) => (o.length === next.length && o.every((v, i) => v === next[i]) ? o : next));
  }, [smoother]);

  // immediately on joins/leaves/finishes/new round, then at most once per second
  useEffect(() => {
    if (room.state === "waiting") prev.current = [];
    compute();
  }, [compute, joinOrder, finishedKey, room.round, room.state]);
  useEffect(() => {
    if (!racing) return;
    const id = setInterval(compute, RANK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [racing, compute]);

  return order;
}

// ---------------------------------------------------------------------------
// lanes
// ---------------------------------------------------------------------------

interface LaneInfo {
  p: RacePlayer;
  place: number;
  words: number;
  wpm: number;
}

function PlaceBadge({ place, total, finished, show }: { place: number; total: number; finished: boolean; show: boolean }) {
  if (!show || place < 1) return <span className="rc-place text-sub">–</span>;
  if (finished && place <= 3) return <Medal place={place} size={22} />;
  return (
    <span className={`rc-place tabular ${finished ? "text-main" : "text-text"}`}>
      #{place}
      <span className="text-sub">/{total}</span>
    </span>
  );
}

const Lane = memo(function Lane({
  info,
  total,
  wc,
  you,
  host,
  showPlace,
  laneRef,
  slot,
}: {
  info: LaneInfo;
  total: number;
  wc: number;
  you: boolean;
  host: boolean;
  showPlace: boolean;
  laneRef: LaneRef;
  slot: string;
}) {
  const t = useT();
  const { p, place, words, wpm } = info;
  const finished = p.place > 0;
  const shownPlace = finished ? p.place : place;
  const top = showPlace && shownPlace >= 1 && shownPlace <= 3 ? ` rc-top${shownPlace}` : "";
  return (
    <div
      ref={laneRef(p.pid, slot)}
      data-lane-pid={p.pid}
      data-place={showPlace ? place : 0}
      className={`rc-lane ${you ? "rc-me" : ""} ${finished ? "rc-done" : ""} ${p.connected ? "" : "rc-off"} ${top}`}
    >
      <div className="rc-lane-place">
        <PlaceBadge place={finished ? p.place : place} total={total} finished={finished} show={showPlace} />
      </div>
      <div className="rc-lane-name">
        {host ? <CrownIcon size={13} className="shrink-0 text-sub" aria-label={t("race.host")} /> : null}
        <span className="truncate">{p.name}</span>
        {you ? <span className="rc-you-tag">{t("race.you")}</span> : null}
      </div>
      <div className="rc-track" aria-hidden="true">
        <div className="rc-bar" data-bar="" />
        <div className="rc-rail">
          <div className="rc-mover" data-mover="">
            <span className="rc-dot" />
          </div>
        </div>
        <span className="rc-flag" />
      </div>
      <div className="rc-lane-stats tabular">
        <span className="rc-pct" data-pct="">
          0%
        </span>
        <span className="rc-words" title={t("race.wordsDone", { n: words, total: wc })}>
          {Math.min(words, wc)}/{wc}
        </span>
        <span className="rc-wpm">
          {Math.round(wpm)}
          <span className="text-sub"> wpm</span>
        </span>
        <span className="rc-time">{finished && p.finishDs ? `${(p.finishDs / 10).toFixed(1)}s` : ""}</span>
      </div>
    </div>
  );
});

function Lanes({
  infos,
  you,
  host,
  wc,
  showPlace,
  laneRef,
}: {
  infos: LaneInfo[];
  you: number | null;
  host: number;
  wc: number;
  showPlace: boolean;
  laneRef: LaneRef;
}) {
  // fixed lanes in join order, your own lane pinned on top — rows never reshuffle
  const mine = infos.find((i) => i.p.pid === you);
  const rest = infos.filter((i) => i.p.pid !== you).sort((a, b) => a.p.pid - b.p.pid);
  const rows = mine ? [mine, ...rest] : rest;
  return (
    <div className="flex flex-col gap-1.5" role="list">
      {rows.map((info) => (
        <div role="listitem" key={info.p.pid} className="rc-enter">
          <Lane info={info} total={infos.length} wc={wc} you={info.p.pid === you} host={info.p.pid === host} showPlace={showPlace} laneRef={laneRef} slot="lane" />
        </div>
      ))}
    </div>
  );
}

const ROW_H = 40;
const LIST_H = 400;

/** Virtualized list for big rooms (100–200 players): ordered by live place, reordered at most once per second. */
function BigList({
  infos,
  order,
  you,
  host,
  wc,
  showPlace,
  laneRef,
}: {
  infos: LaneInfo[];
  order: number[];
  you: number | null;
  host: number;
  wc: number;
  showPlace: boolean;
  laneRef: LaneRef;
}) {
  const t = useT();
  const [scroll, setScroll] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const byPid = useMemo(() => new Map(infos.map((i) => [i.p.pid, i])), [infos]);
  const rows = order.map((pid) => byPid.get(pid)).filter((x): x is LaneInfo => !!x);
  const start = Math.max(0, Math.floor(scroll / ROW_H) - 4);
  const end = Math.min(rows.length, Math.ceil((scroll + LIST_H) / ROW_H) + 4);
  const myIndex = rows.findIndex((r) => r.p.pid === you);
  const mine = myIndex >= 0 ? rows[myIndex] : null;

  return (
    <div>
      {mine ? (
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Lane info={mine} total={rows.length} wc={wc} you host={mine.p.pid === host} showPlace={showPlace} laneRef={laneRef} slot="pin" />
          </div>
          <button
            type="button"
            className="rc-jump text-btn shrink-0 px-2 py-1 text-xs"
            onClick={() => ref.current?.scrollTo({ top: Math.max(0, myIndex * ROW_H - LIST_H / 2 + ROW_H / 2), behavior: "smooth" })}
          >
            ↧ {t("race.jumpToMe")}
          </button>
        </div>
      ) : null}
      <div ref={ref} className="rc-biglist" style={{ height: Math.min(LIST_H, rows.length * ROW_H + 8) }} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
        <div style={{ height: rows.length * ROW_H, position: "relative" }}>
          {rows.slice(start, end).map((info, k) => {
            const i = start + k;
            return (
              <div key={info.p.pid} className="rc-row" style={{ transform: `translateY(${i * ROW_H}px)`, height: ROW_H }}>
                <Lane
                  info={{ ...info, place: info.place || i + 1 }}
                  total={rows.length}
                  wc={wc}
                  you={info.p.pid === you}
                  host={info.p.pid === host}
                  showPlace={showPlace}
                  laneRef={laneRef}
                  slot="row"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// your own position
// ---------------------------------------------------------------------------

function MeBanner({
  place,
  total,
  gapNext,
  gapLeader,
  lead,
  finished,
  laneRef,
  pid,
}: {
  place: number;
  total: number;
  gapNext: number | null;
  gapLeader: number | null;
  lead: number | null;
  finished: boolean;
  laneRef: LaneRef;
  pid: number;
}) {
  const t = useT();
  return (
    <div ref={laneRef(pid, "banner")} className="rc-banner" aria-live="polite" data-me-place={place}>
      <div className="flex items-baseline gap-2">
        <span className="rc-banner-main">
          <span key={place} className="rc-pop inline-block">
            {t("race.meBanner", { place })}
          </span>
          <span className="text-sub"> · </span>
          <span data-pct="">0%</span>
        </span>
        <span className="text-sm text-sub tabular">/ {total}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-sub tabular">
        {finished ? null : lead !== null ? (
          <span className="text-main">{lead > 0 ? t("race.leading", { n: lead }) : t("race.gapTied")}</span>
        ) : (
          <>
            {gapNext !== null ? <span>{gapNext > 0 ? t("race.gapNext", { n: gapNext }) : t("race.gapTied")}</span> : null}
            {gapLeader !== null && place > 2 ? <span>{t("race.gapLeader", { n: gapLeader })}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// typing
// ---------------------------------------------------------------------------

export interface LocalProgress {
  chars: number;
  words: number;
}

/** Restore a fresh engine to `words` completed words (page refresh mid-race). */
function restoreEngine(engine: TypingEngine, words: number, startAtLocal: number | null) {
  const n = Math.max(0, Math.min(words, engine.words.length - 1));
  if (n <= 0) return 0;
  engine.inputs = engine.words.slice(0, n);
  engine.index = n;
  engine.minIndex = n;
  const now = performance.now();
  const elapsed = startAtLocal !== null ? Math.max(1, Date.now() - startAtLocal) : 1;
  engine.startedAt = now - elapsed;
  engine.lastKeyAt = now;
  engine.correctKeys = engine.inputs.reduce((s, w) => s + w.length + 1, 0);
  engine.version++;
  return n;
}

/** Typing area bound to the room text; reports throttled progress. */
function RaceTyping({
  room,
  send,
  onLocalFinish,
  onLocalProgress,
}: {
  room: RoomView;
  send: (m: ClientMsg) => void;
  onLocalFinish: () => void;
  onLocalProgress: (p: LocalProgress) => void;
}) {
  const t = useT();
  const { settings } = useApp();
  const me = room.you !== null ? room.players[room.you] : null;
  const initialWords = useRef(me?.words ?? 0);
  const [restored, setRestored] = useState(0);
  const engine = useMemo(() => new TypingEngine(room.text.split(" "), { mode: "words", freedom: false, confidence: "off" }), [room.text, room.round]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = useNow(room.state === "countdown", 50);
  const canType = room.state === "racing" || (room.state === "countdown" && room.startAt !== null && now >= room.startAt);
  const last = useRef({ c: -1, w: -1 });
  const best = useRef({ c: 0, w: 0 });
  const finishedSent = useRef(false);

  const progress = useCallback(() => {
    const counts = engine.counts(true);
    // never report less than before: a typo / backspace doesn't move you backwards
    best.current = { c: Math.max(best.current.c, counts.correctWordChars + counts.correctSpaces), w: Math.max(best.current.w, engine.index) };
    return { c: best.current.c, w: best.current.w, e: engine.incorrectKeys };
  }, [engine]);

  useEffect(() => {
    finishedSent.current = false;
    last.current = { c: -1, w: -1 };
    best.current = { c: 0, w: 0 };
    // refresh mid-race: continue from the words the server already has
    if (room.state === "racing" && initialWords.current > 0 && !engine.started) {
      const n = restoreEngine(engine, initialWords.current, room.startAt);
      if (n > 0) {
        setRestored(n);
        const p = progress();
        onLocalProgress({ chars: p.c, words: p.w });
      }
    }
    initialWords.current = 0;
  }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!restored) return;
    const id = setTimeout(() => setRestored(0), 4000);
    return () => clearTimeout(id);
  }, [restored]);

  useEffect(() => {
    if (!canType) return;
    const id = setInterval(() => {
      if (engine.finished || !engine.started) return;
      const p = progress();
      if (p.c !== last.current.c || p.w !== last.current.w) {
        last.current = p;
        send({ t: "p", ...p });
      }
    }, PROGRESS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [canType, engine, progress, send]);

  const onChange = useCallback(
    (_k: "insert" | "delete", finished: boolean) => {
      const p = progress();
      onLocalProgress({ chars: finished ? room.text.length : p.c, words: finished ? engine.words.length : p.w });
      if (finished && !finishedSent.current) {
        finishedSent.current = true;
        const r = engine.result();
        send({ t: "fin", c: r.counts.correctWordChars + r.counts.correctSpaces, w: engine.words.length, e: engine.incorrectKeys, acc: r.acc });
        onLocalFinish();
      }
    },
    [engine, send, onLocalFinish, onLocalProgress, progress, room.text.length],
  );

  return (
    <div className="relative">
      {restored ? (
        <div className="rc-toast fade-in" role="status">
          {t("race.restored", { n: restored + 1 })}
        </div>
      ) : null}
      <TypingSurface
        key={`${room.code}-${room.round}`}
        engine={engine}
        settings={{ ...settings, tapeMode: false }}
        disabled={!canType || engine.finished}
        autoFocus={canType}
        onChange={onChange}
        effects={settings.effects}
        comboLabel={t("test.combo")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// results
// ---------------------------------------------------------------------------

interface ResultRow {
  p: RacePlayer;
  pid: number;
  place: number;
  wpm: number;
  acc: number;
  dur: number;
}

function Podium({ rows, you }: { rows: ResultRow[]; you: number | null }) {
  const top = rows.filter((r) => r.place >= 1 && r.place <= 3).sort((a, b) => a.place - b.place);
  if (top.length === 0) return null;
  // classic podium layout: 2 – 1 – 3
  const layout = [top[1], top[0], top[2]].filter((x): x is ResultRow => !!x);
  return (
    <div className="rc-podium" role="list">
      {layout.map((r) => (
        <div key={r.pid} role="listitem" className={`rc-step rc-step-${r.place} ${r.pid === you ? "rc-step-me" : ""}`} style={{ animationDelay: `${(3 - r.place) * 90 + 60}ms` }}>
          <Medal place={r.place} size={r.place === 1 ? 40 : 32} />
          <div className="mt-2 max-w-full truncate text-text">{r.p.name}</div>
          <div className="mt-0.5 text-2xl text-main tabular">
            {r.wpm.toFixed(0)}
            <span className="ml-1 text-xs text-sub">wpm</span>
          </div>
          <div className="text-xs text-sub tabular">
            {r.acc.toFixed(0)}% · {r.dur.toFixed(1)}s
          </div>
          <div className="rc-block" aria-hidden="true">
            {r.place}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// room screen
// ---------------------------------------------------------------------------

export function RoomScreen({ room, send, status, smoother }: { room: RoomView; send: (m: ClientMsg) => void; status: string; smoother: ProgressSmoother }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [localDone, setLocalDone] = useState(false);
  const racingish = room.state === "racing" || room.state === "countdown";
  const now = useNow(room.state === "waiting" || racingish, racingish ? 250 : 200);
  const local = useRef<LocalProgress>({ chars: 0, words: 0 });
  const laneRef = useLanePainter(smoother);
  const order = useRanking(room, smoother);
  const me = room.you !== null ? room.players[room.you] : null;
  const isHost = room.you !== null && room.you === room.host;
  const players = Object.values(room.players);
  const big = players.length > BIG_ROOM;
  const spectating = room.you === null;
  const textLen = Math.max(1, room.text.length);

  useEffect(() => {
    setLocalDone(false);
    local.current = { chars: 0, words: 0 };
  }, [room.round]);

  useEffect(() => {
    if (room.you !== null) smoother.tune(room.you, LOCAL_TUNING);
  }, [room.you, room.round, smoother]);

  const onLocalProgress = useCallback(
    (p: LocalProgress) => {
      local.current = { chars: Math.max(local.current.chars, p.chars), words: Math.max(local.current.words, p.words) };
      // optimistic: your own lane follows your typing immediately (never backwards)
      if (room.you !== null) smoother.set(room.you, local.current.chars / textLen);
    },
    [room.you, smoother, textLen],
  );
  const onLocalFinish = useCallback(() => setLocalDone(true), []);

  const showPlace = room.state === "racing" || room.state === "finished";
  const placeOf = useMemo(() => new Map(order.map((pid, i) => [pid, i + 1])), [order]);
  const elapsedMin = room.startAt !== null ? Math.max(0, now - room.startAt) / 60000 : 0;

  const infos: LaneInfo[] = players.map((p) => {
    const isMe = p.pid === room.you;
    const words = isMe ? Math.max(p.words, local.current.words) : p.words;
    const wpm = isMe && p.place === 0 && elapsedMin > 1 / 60 && room.state === "racing" ? local.current.chars / 5 / elapsedMin : p.wpm;
    return { p, place: p.place > 0 ? p.place : (placeOf.get(p.pid) ?? 0), words, wpm };
  });

  // gaps (in characters) to the player ahead and to the leader
  let gapNext: number | null = null;
  let gapLeader: number | null = null;
  let lead: number | null = null;
  const myPlace = me ? (me.place > 0 ? me.place : (placeOf.get(me.pid) ?? 0)) : 0;
  if (me && showPlace && myPlace > 0) {
    const mine = smoother.target(me.pid);
    const chars = (pid: number | undefined) => (pid === undefined ? 0 : Math.max(0, Math.round((smoother.target(pid) - mine) * textLen)));
    if (myPlace === 1) {
      const second = order.find((pid) => pid !== me.pid);
      lead = second === undefined ? null : Math.max(0, Math.round((mine - smoother.target(second)) * textLen));
    } else {
      const idx = order.indexOf(me.pid);
      gapNext = chars(order[idx - 1]);
      gapLeader = chars(order[0]);
    }
  }

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/race?room=${room.code}` : "";
  const countdown = room.state === "countdown" && room.startAt ? Math.max(0, Math.ceil((room.startAt - now) / 1000)) : null;
  const autoIn = room.state === "waiting" && room.autoAt ? Math.max(0, Math.ceil((room.autoAt - now) / 1000)) : null;


  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const results: ResultRow[] | null = room.results
    ? room.results.map(([pid, place, wpm, acc, dur]) => ({ p: room.players[pid], pid, place, wpm, acc, dur })).filter((r) => r.p)
    : null;
  const myResult = results?.find((r) => r.pid === room.you) ?? null;

  return (
    <div className="rc-room mx-auto w-full py-6" data-race-state={room.state}>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sub">{t("race.code")}</span>
          <span className="font-mono text-xl tracking-widest text-text">{room.code}</span>
        </div>
        <button type="button" className="btn rc-press px-3 py-1.5 text-xs" onClick={copy}>
          <LinkIcon size={14} /> {copied ? t("common.copied") : t("race.copyLink")}
        </button>
        <span className="text-sm text-sub">
          {languageInfo(room.lang).label.toLowerCase()} · {room.tt === "words" ? t("race.words", { n: room.len }) : t("config.quote")} · {room.pub ? t("race.public") : t("race.private")}
        </span>
        <span className="flex items-center gap-1.5 text-sm text-sub">
          <UsersIcon size={14} /> {t("race.players", { n: players.length, max: room.max })}
        </span>
        <span key={room.state} className={`rc-state rc-pop ${room.state === "racing" ? "rc-state-live" : ""}`}>
          {room.state === "racing" ? <span className="rc-live-dot" aria-hidden="true" /> : null}
          {t(`race.state.${room.state}` as DictKey)}
        </span>
        <button type="button" className="btn rc-press ml-auto px-3 py-1.5 text-sm" onClick={() => send({ t: "leave" })}>
          {t("race.leave")}
        </button>
      </div>

      {status !== "open" ? <div className="fade-in mb-4 rounded-lg bg-error/15 px-4 py-2 text-sm text-error">{t("race.reconnecting")}</div> : null}
      {spectating ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-sub-alt px-4 py-2 text-sm text-sub">
          <EyeIcon size={16} /> {t("race.spectating")}
        </div>
      ) : null}

      {me && showPlace && room.state !== "finished" ? (
        <MeBanner
          place={myPlace}
          total={players.length}
          gapNext={gapNext}
          gapLeader={gapLeader}
          lead={lead}
          finished={me.place > 0}
          laneRef={laneRef}
          pid={me.pid}
        />
      ) : null}

      <div className="mb-6">
        {big ? (
          <BigList infos={infos} order={order} you={room.you} host={room.host} wc={room.wc} showPlace={showPlace} laneRef={laneRef} />
        ) : (
          <Lanes infos={infos} you={room.you} host={room.host} wc={room.wc} showPlace={showPlace} laneRef={laneRef} />
        )}
      </div>

      {room.state === "waiting" ? (
        <div className="rc-waiting card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-text">
              <span className="rc-pulse" aria-hidden="true" />
              {t("race.waitingRoom")}
            </div>
            {!room.pub && isHost ? (
              <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm">
                <span className="text-sub">{t("race.invite")}</span>
                <button type="button" onClick={copy} className="rc-invite min-w-0 truncate" title={t("race.copyLink")}>
                  {inviteUrl}
                </button>
              </div>
            ) : (
              <span className="text-sm text-sub">
                {room.pub ? (autoIn !== null ? t("race.autoStart", { s: autoIn }) : t("race.waitingPlayers")) : t("race.waitingHost")}
              </span>
            )}
          </div>
          {isHost ? (
            <button type="button" className="btn btn-primary rc-press rc-cta" onClick={() => send({ t: "start" })}>
              {t("race.start")}
            </button>
          ) : null}
        </div>
      ) : null}

      {room.state === "countdown" && countdown !== null ? (
        <div className="rc-countdown" aria-live="assertive">
          <span className="text-sub">{t("race.startsIn")}</span>
          <span key={countdown} className={`rc-count font-typing tabular ${countdown === 0 ? "rc-go" : ""}`}>
            {countdown > 0 ? countdown : t("race.go")}
          </span>
        </div>
      ) : null}

      {!spectating && racingish ? (
        <div className="relative">
          {localDone || (me && me.place > 0) ? (
            <div className="rc-finish card px-5 py-6 text-center text-main">
              {me && me.place > 0 ? (
                <span className="inline-flex items-center gap-2">
                  <Medal place={me.place} size={26} /> {t("race.finishedPlace", { place: me.place })}
                </span>
              ) : (
                t("race.finishedWait")
              )}
            </div>
          ) : (
            <RaceTyping room={room} send={send} onLocalFinish={onLocalFinish} onLocalProgress={onLocalProgress} />
          )}
        </div>
      ) : null}

      {room.state === "waiting" && !spectating ? (
        <div className="mt-8 opacity-40">
          <div className="words-wrap">
            <div className="words-clip">
              <div className="words">
                {room.text.split(" ").slice(0, 60).map((w, i) => (
                  <div key={i} className="word">
                    {w}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {room.src && room.state !== "waiting" ? <p className="mt-4 text-right text-xs text-sub">— {room.src}</p> : null}

      {room.state === "finished" && results ? (
        <div className="rc-results mt-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl text-text">{t("race.results")}</h2>
            {myResult ? (
              <span className="flex flex-wrap items-center gap-2 text-sm text-sub">
                {t("race.yourResult")}:{" "}
                <span className="text-main tabular">
                  {myResult.place ? `#${myResult.place} · ${myResult.wpm.toFixed(0)} wpm` : t("race.dnf")}
                </span>
                {room.xp && room.xp.gained > 0 ? (
                  <span className="rc-xp rc-pop tabular" data-race-xp={room.xp.gained}>
                    {t("race.xpGained", { n: Math.round(room.xp.gained) })}
                  </span>
                ) : null}
                {room.xp && room.xp.level > room.xp.prevLevel ? (
                  <span className="rc-xp rc-xp-level rc-pop">{t("race.levelUp", { level: room.xp.level })}</span>
                ) : null}
              </span>
            ) : null}
            {room.pub || isHost ? (
              <button type="button" className="btn btn-primary rc-press" onClick={() => send({ t: "again" })} autoFocus>
                {t("race.again")}
              </button>
            ) : null}
          </div>
          <Podium rows={results} you={room.you} />
          <div className="overflow-x-auto">
            <table className="table rc-table text-sm">
              <thead>
                <tr>
                  <th className="w-14">{t("table.place")}</th>
                  <th>{t("table.name")}</th>
                  <th className="num">{t("table.wpm")}</th>
                  <th className="num hidden sm:table-cell">cpm</th>
                  <th className="num">{t("table.acc")}</th>
                  <th className="num">{t("result.time")}</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 200).map((r, i) => (
                  <tr key={r.pid} className={`rc-rrow ${r.pid === room.you ? "text-main" : ""}`} style={{ animationDelay: `${Math.min(i, 12) * 30 + 250}ms` }}>
                    <td>{r.place ? <Medal place={r.place} /> : <span className="text-xs text-sub">{t("race.dnf")}</span>}</td>
                    <td className="truncate">{r.p.name}</td>
                    <td className="num">{r.place ? r.wpm.toFixed(1) : "-"}</td>
                    <td className="num hidden sm:table-cell">{r.place ? (r.wpm * 5).toFixed(0) : "-"}</td>
                    <td className="num">{r.place ? `${r.acc.toFixed(1)}%` : "-"}</td>
                    <td className="num">{r.place ? `${r.dur.toFixed(1)}s` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
