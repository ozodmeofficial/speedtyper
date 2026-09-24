"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/providers/I18nProvider";
import { BoltIcon, LinkIcon, UsersIcon } from "@/components/ui/icons";
import { MAX_PLAYERS, RACE_LANGS, RACE_WORD_LENGTHS, type ClientMsg, type LobbyRoom, type RaceLanguage, type TextType } from "@/lib/race/protocol";
import { languageInfo } from "@/lib/typing/words";
import { NICK_KEY } from "./useRace";
import type { DictKey } from "@/lib/i18n";

const LANG_KEY = "st_race_lang";

function Seg<T extends string | number | boolean>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.v)} type="button" onClick={() => onChange(o.v)} aria-pressed={value === o.v} className={`btn rc-press px-3 py-1.5 text-sm ${value === o.v ? "active" : ""}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Lobby({
  rooms,
  online,
  me,
  send,
  signedIn,
}: {
  rooms: LobbyRoom[];
  online: number;
  me: { name: string; user: boolean } | null;
  send: (m: ClientMsg) => void;
  signedIn: boolean;
}) {
  const t = useT();
  const [lang, setLang] = useState<RaceLanguage>("english");
  const [pub, setPub] = useState(false);
  const [tt, setTt] = useState<TextType>("words");
  const [len, setLen] = useState<number>(25);
  const [max, setMax] = useState<number>(MAX_PLAYERS);
  const [code, setCode] = useState("");
  const [nick, setNick] = useState("");
  const [nickSaved, setNickSaved] = useState(false);

  useEffect(() => {
    try {
      const l = localStorage.getItem(LANG_KEY) as RaceLanguage | null;
      if (l && RACE_LANGS.includes(l)) setLang(l);
      setNick(localStorage.getItem(NICK_KEY) ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  const chooseLang = (l: RaceLanguage) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  };

  const saveNick = () => {
    const n = nick.trim().slice(0, 20);
    try {
      localStorage.setItem(NICK_KEY, n);
    } catch {
      /* ignore */
    }
    send({ t: "hello", name: n });
    setNickSaved(true);
    setTimeout(() => setNickSaved(false), 1500);
  };

  const langOptions = RACE_LANGS.map((l) => ({ v: l, label: languageInfo(l).label.toLowerCase() }));
  const lenOptions =
    tt === "words"
      ? RACE_WORD_LENGTHS.map((n) => ({ v: n as number, label: String(n) }))
      : [
          { v: 1, label: t("quote.short") },
          { v: 2, label: t("quote.medium") },
          { v: 3, label: t("quote.long") },
        ];

  return (
    <div className="rc-lobby mx-auto w-full py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-text">{t("race.title")}</h1>
          <p className="mt-2 max-w-xl text-sm text-sub">{t("race.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-sub">
          <span className="rc-online-dot" aria-hidden="true" />
          {t("race.online", { n: online })}
        </div>
      </div>

      <div className="mt-8 grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="rc-card card flex flex-col gap-5 p-6">
          <div>
            <div className="label mb-2">{t("race.language")}</div>
            <Seg value={lang} options={langOptions} onChange={chooseLang} />
          </div>
          <button type="button" onClick={() => send({ t: "quick", lang })} className="btn btn-primary rc-quick w-full py-3 text-base">
            <BoltIcon size={18} /> {t("race.quick")}
          </button>
          <p className="-mt-2 text-xs text-sub">{t("race.quickDesc")}</p>
          <div className="border-t-2 border-bg pt-5">
            <div className="label mb-2">{t("race.nickname")}</div>
            {signedIn ? (
              <div className="text-sm text-text">{me?.name}</div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    className="input"
                    value={nick}
                    maxLength={20}
                    onChange={(e) => setNick(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveNick()}
                    placeholder={me?.name ?? "guest"}
                    aria-label={t("race.nickname")}
                  />
                  <button type="button" className="btn rc-press shrink-0" onClick={saveNick}>
                    {nickSaved ? "✓" : t("race.save")}
                  </button>
                </div>
                <p className="mt-2 text-xs text-sub">
                  {t("race.nicknameHint")}{" "}
                  <Link href="/login" className="underline underline-offset-4 hover:text-text">
                    {t("nav.login")}
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>

        <div className="rc-card card flex flex-col gap-4 p-6">
          <h2 className="text-text">{t("race.create")}</h2>
          <div>
            <div className="label mb-2">{t("race.visibility")}</div>
            <Seg value={pub} options={[{ v: false, label: t("race.private") }, { v: true, label: t("race.public") }]} onChange={setPub} />
          </div>
          <div>
            <div className="label mb-2">{t("race.textType")}</div>
            <Seg
              value={tt}
              options={[
                { v: "words" as TextType, label: t("config.words") },
                { v: "quote" as TextType, label: t("config.quote") },
              ]}
              onChange={(v) => {
                setTt(v);
                setLen(v === "words" ? 25 : 2);
              }}
            />
          </div>
          <div>
            <div className="label mb-2">{t("race.length")}</div>
            <Seg value={len} options={lenOptions} onChange={setLen} />
          </div>
          <div>
            <div className="label mb-2">{t("race.maxPlayers")}</div>
            <Seg value={max} options={[2, 5, 10, 50, 100, 200].map((n) => ({ v: n, label: String(n) }))} onChange={setMax} />
          </div>
          <button type="button" className="btn btn-primary rc-quick mt-1 w-full" onClick={() => send({ t: "create", pub, lang, tt, len, max })}>
            {t("race.create")}
          </button>
          <form
            className="mt-1 flex gap-2 border-t-2 border-bg pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) send({ t: "join", code: code.trim().toUpperCase() });
            }}
          >
            <input
              className="input font-mono uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 8))}
              placeholder={t("race.code")}
              aria-label={t("race.joinByCode")}
            />
            <button type="submit" className="btn rc-press shrink-0">
              <LinkIcon size={16} /> {t("race.join")}
            </button>
          </form>
        </div>
      </div>

      <h2 className="mt-10 mb-3 text-sm text-sub">{t("race.rooms")}</h2>
      {rooms.length === 0 ? (
        <p className="rc-card card px-5 py-8 text-center text-sm text-sub">{t("race.noRooms")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table rc-table rc-rooms text-sm">
            <thead>
              <tr>
                <th>{t("race.code")}</th>
                <th>{t("race.language")}</th>
                <th>{t("race.textType")}</th>
                <th className="num">{t("table.players")}</th>
                <th>{t("table.info")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rooms.map(([c, l, type, length, players, maxP, state]) => (
                <tr key={c}>
                  <td className="font-mono text-text">{c}</td>
                  <td>{languageInfo(l).label.toLowerCase()}</td>
                  <td className="text-sub">
                    {type === "words" ? t("race.words", { n: length }) : `${t("config.quote")} · ${t((length === 1 ? "quote.short" : length === 3 ? "quote.long" : "quote.medium") as DictKey)}`}
                  </td>
                  <td className="num tabular">
                    <span className="inline-flex items-center gap-1.5">
                      <UsersIcon size={14} /> {players}/{maxP}
                    </span>
                  </td>
                  <td className={state === "waiting" ? "text-main" : "text-sub"}>
                    <span className="inline-flex items-center gap-1.5">
                      {state === "waiting" ? <span className="rc-online-dot" aria-hidden="true" /> : null}
                      {t(`race.state.${state}` as DictKey)}
                    </span>
                  </td>
                  <td className="num">
                    <button type="button" className={`btn rc-press px-3 py-1 text-xs ${state === "waiting" ? "btn-primary" : ""}`} onClick={() => send({ t: "join", code: c })}>
                      {state === "waiting" ? t("race.join") : t("race.watch")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
