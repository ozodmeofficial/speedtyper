"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { useT } from "@/components/providers/I18nProvider";
import { TypingSurface } from "@/components/test/TypingSurface";
import { CrownIcon, LinkIcon, UsersIcon, EyeIcon } from "@/components/ui/icons";
import { TypingEngine } from "@/lib/typing/engine";
import { PROGRESS_INTERVAL_MS, type ClientMsg } from "@/lib/race/protocol";
import { languageInfo } from "@/lib/typing/words";
import type { RacePlayer, RoomView } from "./useRace";
import type { DictKey } from "@/lib/i18n";

const MEDAL = ["#e2b714", "#b8c0cc", "#cd7f32"];

function useNow(active: boolean, interval = 100) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [active, interval]);
  return now;
}

function Medal({ place }: { place: number }) {
  if (place < 1) return null;
  if (place > 3) return <span className="text-xs text-sub tabular">#{place}</span>;
  return (
    <span className="grid h-5 w-5 place-items-center rounded-full text-[0.65rem] font-bold text-[#1d1d1d]" style={{ background: MEDAL[place - 1] }} title={`#${place}`}>
      {place}
    </span>
  );
}

function sortPlayers(players: RacePlayer[]): RacePlayer[] {
  return players.slice().sort((a, b) => {
    if (a.place && b.place) return a.place - b.place;
    if (a.place) return -1;
    if (b.place) return 1;
    return b.chars - a.chars || a.pid - b.pid;
  });
}

/** Full-width lanes for small rooms. */
function Lanes({ players, you, host, textLength }: { players: RacePlayer[]; you: number | null; host: number; textLength: number }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      {players.map((p) => {
        const pct = textLength ? Math.min(100, (p.chars / textLength) * 100) : 0;
        const isYou = p.pid === you;
        return (
          <div key={p.pid} className={`grid grid-cols-[minmax(0,12rem)_1fr_4.5rem] items-center gap-3 text-sm ${p.connected ? "" : "opacity-50"}`}>
            <div className={`flex min-w-0 items-center gap-1.5 ${isYou ? "text-main" : "text-text"}`}>
              {p.pid === host ? <CrownIcon size={13} className="shrink-0 text-sub" aria-label={t("race.host")} /> : null}
              <span className="truncate">{p.name}</span>
              {isYou ? <span className="shrink-0 text-xs text-sub">({t("race.you")})</span> : null}
            </div>
            <div className="relative h-7 rounded-md bg-sub-alt">
              <div className="absolute inset-y-0 left-0 rounded-md bg-sub/25 transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
              <div
                className="absolute top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center transition-[left] duration-200 ease-linear"
                style={{ left: `calc(${pct}% - ${pct / 100} * 1.5rem)` }}
              >
                <span className={`block h-4 w-1.5 rounded-full ${isYou ? "bg-main" : "bg-text"}`} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 tabular">
              <Medal place={p.place} />
              <span className={isYou ? "text-main" : "text-text"}>{Math.round(p.wpm)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const ROW_H = 30;
const LIST_H = 330;

/** Virtualized compact list for big rooms (100–200 players). */
function CompactList({ players, you, textLength }: { players: RacePlayer[]; you: number | null; textLength: number }) {
  const t = useT();
  const [scroll, setScroll] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const start = Math.max(0, Math.floor(scroll / ROW_H) - 4);
  const end = Math.min(players.length, Math.ceil((scroll + LIST_H) / ROW_H) + 4);
  const myIndex = players.findIndex((p) => p.pid === you);

  return (
    <div>
      {myIndex >= 0 ? (
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-main">{t("race.yourPosition", { pos: myIndex + 1, n: players.length })}</span>
          <button
            type="button"
            className="text-btn text-xs"
            onClick={() => ref.current?.scrollTo({ top: Math.max(0, myIndex * ROW_H - LIST_H / 2), behavior: "smooth" })}
          >
            ↧ {t("race.you")}
          </button>
        </div>
      ) : null}
      <div ref={ref} className="card relative overflow-y-auto" style={{ height: LIST_H }} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
        <div style={{ height: players.length * ROW_H, position: "relative" }}>
          {players.slice(start, end).map((p, k) => {
            const i = start + k;
            const pct = textLength ? Math.min(100, (p.chars / textLength) * 100) : 0;
            const isYou = p.pid === you;
            return (
              <div
                key={p.pid}
                className={`absolute inset-x-0 grid grid-cols-[2.5rem_minmax(0,8rem)_1fr_3.5rem] items-center gap-3 px-3 text-xs ${isYou ? "bg-bg text-main" : ""} ${p.connected ? "" : "opacity-50"}`}
                style={{ top: i * ROW_H, height: ROW_H }}
              >
                <span className="tabular text-sub">{p.place ? <Medal place={p.place} /> : i + 1}</span>
                <span className="truncate">{p.name}</span>
                <span className="relative h-1.5 rounded-full bg-bg">
                  <span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-linear ${isYou ? "bg-main" : "bg-sub"}`} style={{ width: `${pct}%` }} />
                </span>
                <span className="text-right tabular">{Math.round(p.wpm)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Typing area bound to the room text; reports throttled progress. */
function RaceTyping({ room, send, onLocalFinish }: { room: RoomView; send: (m: ClientMsg) => void; onLocalFinish: () => void }) {
  const { settings } = useApp();
  const engine = useMemo(() => new TypingEngine(room.text.split(" "), { mode: "words", freedom: false, confidence: "off" }), [room.text, room.round]); // eslint-disable-line react-hooks/exhaustive-deps
  const racing = room.state === "racing" || (room.state === "countdown" && room.startAt !== null && Date.now() >= room.startAt);
  const now = useNow(room.state === "countdown", 50);
  const canType = racing || (room.startAt !== null && now >= room.startAt && room.state !== "finished" && room.state !== "waiting");
  const last = useRef({ c: -1, w: -1 });
  const finishedSent = useRef(false);

  const progress = useCallback(() => {
    const counts = engine.counts(true);
    return { c: counts.correctWordChars + counts.correctSpaces, w: engine.index, e: engine.incorrectKeys };
  }, [engine]);

  useEffect(() => {
    finishedSent.current = false;
    last.current = { c: -1, w: -1 };
  }, [engine]);

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
      if (finished && !finishedSent.current) {
        finishedSent.current = true;
        const r = engine.result();
        send({ t: "fin", c: r.counts.correctWordChars + r.counts.correctSpaces, w: engine.words.length, e: engine.incorrectKeys, acc: r.acc });
        onLocalFinish();
      }
    },
    [engine, send, onLocalFinish],
  );

  return (
    <TypingSurface
      key={`${room.code}-${room.round}`}
      engine={engine}
      settings={{ ...settings, tapeMode: false }}
      disabled={!canType || engine.finished}
      autoFocus={canType}
      onChange={onChange}
    />
  );
}

export function RoomScreen({ room, send, status }: { room: RoomView; send: (m: ClientMsg) => void; status: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [localDone, setLocalDone] = useState(false);
  const now = useNow(room.state === "waiting" || room.state === "countdown", 200);
  const players = useMemo(() => sortPlayers(Object.values(room.players)), [room.players]);
  const me = room.you !== null ? room.players[room.you] : null;
  const isHost = room.you !== null && room.you === room.host;
  const big = players.length > 12;
  const spectating = room.you === null;

  useEffect(() => setLocalDone(false), [room.round]);

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

  const results = room.results
    ? room.results.map(([pid, place, wpm, acc, dur]) => ({ p: room.players[pid], pid, place, wpm, acc, dur })).filter((r) => r.p)
    : null;

  return (
    <div className="mx-auto w-full py-6">
      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sub">{t("race.code")}</span>
          <span className="font-mono text-xl tracking-widest text-text">{room.code}</span>
        </div>
        <button type="button" className="btn px-3 py-1.5 text-xs" onClick={copy}>
          <LinkIcon size={14} /> {copied ? t("common.copied") : t("race.copyLink")}
        </button>
        <span className="text-sm text-sub">
          {languageInfo(room.lang).label.toLowerCase()} · {room.tt === "words" ? t("race.words", { n: room.len }) : t("config.quote")} · {room.pub ? t("race.public") : t("race.private")}
        </span>
        <span className="flex items-center gap-1.5 text-sm text-sub">
          <UsersIcon size={14} /> {t("race.players", { n: players.length, max: room.max })}
        </span>
        <span className={`rounded-md px-2 py-0.5 text-xs ${room.state === "racing" ? "bg-main text-bg" : "bg-sub-alt text-sub"}`}>
          {t(`race.state.${room.state}` as DictKey)}
        </span>
        <button type="button" className="btn ml-auto px-3 py-1.5 text-sm" onClick={() => send({ t: "leave" })}>
          {t("race.leave")}
        </button>
      </div>

      {status !== "open" ? <div className="mb-4 rounded-lg bg-error/15 px-4 py-2 text-sm text-error">{t("race.reconnecting")}</div> : null}
      {spectating ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-sub-alt px-4 py-2 text-sm text-sub">
          <EyeIcon size={16} /> {t("race.spectating")}
        </div>
      ) : null}

      <div className="mb-8">
        {big ? <CompactList players={players} you={room.you} textLength={room.text.length} /> : <Lanes players={players} you={room.you} host={room.host} textLength={room.text.length} />}
      </div>

      {room.state === "waiting" ? (
        <div className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          {!room.pub && isHost ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-sm">
              <span className="text-sub">{t("race.invite")}</span>
              <button type="button" onClick={copy} className="min-w-0 truncate rounded-md bg-bg px-3 py-1.5 font-mono text-xs text-text hover:text-main" title={t("race.copyLink")}>
                {inviteUrl}
              </button>
            </div>
          ) : (
            <span className="text-sm text-sub">
              {room.pub ? (autoIn !== null ? t("race.autoStart", { s: autoIn }) : t("race.waitingPlayers")) : t("race.waitingHost")}
            </span>
          )}
          {isHost ? (
            <button type="button" className="btn btn-primary" onClick={() => send({ t: "start" })}>
              {t("race.start")}
            </button>
          ) : null}
        </div>
      ) : null}

      {room.state === "countdown" && countdown !== null ? (
        <div className="mb-4 flex items-baseline justify-center gap-3" aria-live="assertive">
          <span className="text-sub">{t("race.startsIn")}</span>
          <span key={countdown} className="fade-in font-typing text-5xl text-main tabular">
            {countdown > 0 ? countdown : t("race.go")}
          </span>
        </div>
      ) : null}

      {!spectating && room.state !== "waiting" && room.state !== "finished" ? (
        <div className="relative">
          {localDone || (me && me.place > 0) ? (
            <div className="card px-5 py-6 text-center text-main">{me && me.place > 0 ? t("race.finishedPlace", { place: me.place }) : t("race.finishedWait")}</div>
          ) : (
            <RaceTyping room={room} send={send} onLocalFinish={() => setLocalDone(true)} />
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
        <div className="fade-in mt-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl text-text">{t("race.results")}</h2>
            <div className="flex gap-2">
              {room.pub || isHost ? (
                <button type="button" className="btn btn-primary" onClick={() => send({ t: "again" })} autoFocus>
                  {t("race.again")}
                </button>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th className="w-14">{t("table.place")}</th>
                  <th>{t("table.name")}</th>
                  <th className="num">{t("table.wpm")}</th>
                  <th className="num">{t("table.acc")}</th>
                  <th className="num">{t("result.time")}</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 200).map((r) => (
                  <tr key={r.pid} className={r.pid === room.you ? "text-main" : ""}>
                    <td>{r.place ? <Medal place={r.place} /> : <span className="text-xs text-sub">{t("race.dnf")}</span>}</td>
                    <td className="truncate">{r.p.name}</td>
                    <td className="num">{r.place ? r.wpm.toFixed(1) : "-"}</td>
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
