import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestContext } from "@/server/context";
import { activity, getProfile, personalBests, recentRaces, recentResults, RESULTS_PER_PAGE, wpmHistory } from "@/server/profile";
import { Heatmap } from "@/components/profile/Heatmap";
import { HistoryChart } from "@/components/profile/HistoryChart";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { fmt, fmtInt, formatDate, formatDateTime, formatDuration, formatDurationShort } from "@/lib/format";
import { languageInfo } from "@/lib/typing/words";
import { ChevronLeftIcon, ChevronRightIcon, CrownIcon, GearIcon } from "@/components/ui/icons";
import type { DictKey } from "@/lib/i18n";

type Params = Promise<{ username: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username } = await params;
  const u = await getProfile(decodeURIComponent(username));
  return { title: u ? u.username : "404", alternates: u ? { canonical: `/u/${u.username}` } : undefined };
}

const TIME_COLS = ["15", "30", "60", "120"];
const WORD_COLS = ["10", "25", "50", "100"];

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-sm text-sub">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { username } = await params;
  const sp = await searchParams;
  const { t, dict, user: me } = await getRequestContext();
  const profile = await getProfile(decodeURIComponent(username));
  if (!profile) notFound();
  const page = Math.max(1, Math.min(1000, Number(sp.page) || 1));
  const months = dict["months.short"];

  const [pbs, recent, act, history, races] = await Promise.all([
    personalBests(profile.id),
    recentResults(profile.id, page),
    activity(profile.id),
    wpmHistory(profile.id),
    recentRaces(profile.id),
  ]);
  const hasNext = recent.length > RESULTS_PER_PAGE;
  const rows = recent.slice(0, RESULTS_PER_PAGE);
  const isMe = me?.id === profile.id;

  const pbLangs = [...new Set(pbs.map((p) => p.language))].sort();
  const pbFor = (mode: string, mode2: string, lang: string) => pbs.find((p) => p.mode === mode && p.mode2 === mode2 && p.language === lang);
  const initials = profile.username.slice(0, 2).toUpperCase();

  const stats: [string, string][] = [
    [t("profile.testsStarted"), fmtInt(profile.testsStarted)],
    [t("profile.testsCompleted"), fmtInt(profile.testsCompleted)],
    [t("profile.timeTyping"), formatDurationShort(profile.timeTyping, { h: dict["time.h"], m: dict["time.m"], s: dict["time.s"] })],
    [t("profile.races"), fmtInt(profile.racesCompleted)],
    [t("profile.raceWins"), fmtInt(profile.raceWins)],
  ];

  return (
    <div className="mx-auto w-full py-8">
      <div className="card grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-bg text-2xl font-semibold text-main" aria-hidden="true">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-3xl text-text">{profile.username}</h1>
            <div className="text-sm text-sub">{t("profile.joined", { date: formatDate(profile.createdAt, months) })}</div>
            {isMe ? (
              <div className="mt-3 flex gap-2">
                <Link href="/settings" className="btn text-sm">
                  <GearIcon size={15} /> {t("nav.settings")}
                </Link>
                <LogoutButton />
              </div>
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5 md:border-l-4 md:border-bg md:pl-8">
          {stats.map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col justify-between gap-1" title={k === t("profile.timeTyping") ? formatDuration(profile.timeTyping) : undefined}>
              <dt className="text-xs leading-snug text-sub">{k}</dt>
              <dd className="truncate font-typing text-2xl text-text tabular">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Section title={t("profile.pbs")}>
        {pbLangs.length === 0 ? (
          <p className="card px-5 py-6 text-center text-sm text-sub">{t("profile.noResults")}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(
              [
                ["time", TIME_COLS],
                ["words", WORD_COLS],
              ] as const
            ).map(([mode, cols]) => (
              <div key={mode} className="card overflow-x-auto p-4">
                <table className="w-full text-center tabular">
                  <thead>
                    <tr className="text-xs text-sub">
                      <th className="pb-2 text-left font-normal">{t(`config.${mode}` as DictKey)}</th>
                      {cols.map((c) => (
                        <th key={c} className="pb-2 font-normal">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pbLangs.map((lang) => (
                      <tr key={lang}>
                        <td className="py-1.5 pr-3 text-left text-xs whitespace-nowrap text-sub">{languageInfo(lang).label.toLowerCase()}</td>
                        {cols.map((c) => {
                          const pb = pbFor(mode, c, lang);
                          return (
                            <td key={c} className="py-1.5" title={pb ? `${fmt(pb.wpm, 2)} wpm · ${fmt(pb.acc, 2)}% · ${formatDate(pb.created_at, months)}` : undefined}>
                              {pb ? (
                                <>
                                  <div className="font-typing text-xl leading-tight text-text">{Math.round(pb.wpm)}</div>
                                  <div className="text-[0.7rem] text-sub">{Math.round(pb.acc)}%</div>
                                </>
                              ) : (
                                <div className="font-typing text-xl text-sub">-</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("profile.activity")}>
        <div className="card p-5">
          <Heatmap
            counts={act}
            months={months}
            weekdays={dict["weekdays.short"]}
            label={(date, n) => (n ? t("profile.testsOn", { date, n }) : t("profile.noTestsOn", { date }))}
            less={t("profile.less")}
            more={t("profile.more")}
          />
        </div>
      </Section>

      {history.length > 1 ? (
        <Section title={t("profile.history")}>
          <div className="card p-4">
            <HistoryChart points={history.map((h) => ({ wpm: h.wpm, acc: h.acc }))} />
          </div>
        </Section>
      ) : null}

      <Section
        title={t("profile.recent")}
        right={
          page > 1 || hasNext ? (
            <div className="flex items-center gap-1 text-sm">
              {page > 1 ? (
                <Link href={`?page=${page - 1}`} className="text-btn grid h-8 w-8 place-items-center" aria-label={t("common.prev")} scroll={false}>
                  <ChevronLeftIcon size={17} />
                </Link>
              ) : (
                <span className="grid h-8 w-8 place-items-center text-sub opacity-40">
                  <ChevronLeftIcon size={17} />
                </span>
              )}
              <span className="px-1 text-sub tabular">{t("common.page", { n: page })}</span>
              {hasNext ? (
                <Link href={`?page=${page + 1}`} className="text-btn grid h-8 w-8 place-items-center" aria-label={t("common.next")} scroll={false}>
                  <ChevronRightIcon size={17} />
                </Link>
              ) : (
                <span className="grid h-8 w-8 place-items-center text-sub opacity-40">
                  <ChevronRightIcon size={17} />
                </span>
              )}
            </div>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <p className="card px-5 py-6 text-center text-sm text-sub">{t("profile.noResults")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th className="w-8" />
                  <th className="num">{t("table.wpm")}</th>
                  <th className="num">{t("table.raw")}</th>
                  <th className="num">{t("table.acc")}</th>
                  <th className="num">{t("table.consistency")}</th>
                  <th className="num">{t("result.characters")}</th>
                  <th>{t("table.mode")}</th>
                  <th>{t("table.info")}</th>
                  <th className="num">{t("table.date")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-main">{r.isPb ? <CrownIcon size={14} aria-label="pb" /> : null}</td>
                    <td className="num">{fmt(r.wpm, 2)}</td>
                    <td className="num">{fmt(r.raw, 2)}</td>
                    <td className="num">{fmt(r.acc, 2)}%</td>
                    <td className="num">{fmt(r.consistency, 2)}%</td>
                    <td className="num text-sub">{`${r.charCorrect}/${r.charIncorrect}/${r.charExtra}/${r.charMissed}`}</td>
                    <td className="whitespace-nowrap">
                      {t(`config.${r.mode}` as DictKey)} {r.mode === "time" || r.mode === "words" ? r.mode2 : r.mode === "quote" ? t(`quote.${r.mode2}` as DictKey) : ""}
                    </td>
                    <td className="whitespace-nowrap text-sub">
                      {languageInfo(r.language).label.toLowerCase()}
                      {r.punctuation ? " @" : ""}
                      {r.numbers ? " #" : ""}
                    </td>
                    <td className="num whitespace-nowrap text-sub">{formatDateTime(r.createdAt, months)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={t("profile.recentRaces")}>
        {races.length === 0 ? (
          <p className="card px-5 py-6 text-center text-sm text-sub">{t("profile.noRaces")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>{t("table.place")}</th>
                  <th className="num">{t("table.wpm")}</th>
                  <th className="num">{t("table.acc")}</th>
                  <th className="num">{t("table.players")}</th>
                  <th>{t("table.language")}</th>
                  <th className="num">{t("table.date")}</th>
                </tr>
              </thead>
              <tbody>
                {races.map((r) => (
                  <tr key={r.id}>
                    <td className={r.place === 1 ? "text-main" : ""}>{r.finished && r.place ? `#${r.place}` : t("race.dnf")}</td>
                    <td className="num">{fmt(r.wpm, 1)}</td>
                    <td className="num">{fmt(r.acc, 1)}%</td>
                    <td className="num">{r.race.playerCount}</td>
                    <td className="text-sub">{languageInfo(r.race.language).label.toLowerCase()}</td>
                    <td className="num whitespace-nowrap text-sub">{formatDateTime(r.createdAt, months)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
