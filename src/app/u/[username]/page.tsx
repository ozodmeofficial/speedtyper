import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestContext } from "@/server/context";
import { activity, best60, getProfile, personalBests, recentRaces, recentResults, RESULTS_PER_PAGE, wpmHistory, xpPerDay } from "@/server/profile";
import { syncAchievements } from "@/server/xp";
import { Heatmap } from "@/components/profile/Heatmap";
import { HistoryChart } from "@/components/profile/HistoryChart";
import { LogoutButton } from "@/components/profile/LogoutButton";
import { fmt, fmtInt, formatDate, formatDateTime, formatDuration, formatDurationShort } from "@/lib/format";
import { languageInfo } from "@/lib/typing/words";
import { ChevronLeftIcon, ChevronRightIcon, CrownIcon, GearIcon } from "@/components/ui/icons";
import type { DictKey } from "@/lib/i18n";
import { XpChart } from "@/components/profile/XpChart";
import { AchievementIcon, FlameIcon, LevelBadge, readable, SpeedRankChip, TierChip } from "@/components/xp/Badges";
import { effectiveStreak, levelProgress, nextSpeedRank, speedRankFor, tierForLevel } from "@/lib/xp";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { dayKey } from "@/lib/format";

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
        <h2 className="text-sm tracking-wide text-sub">{title}</h2>
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

  const [pbs, recent, act, history, races, b60, xpDays, achs] = await Promise.all([
    personalBests(profile.id),
    recentResults(profile.id, page),
    activity(profile.id),
    wpmHistory(profile.id),
    recentRaces(profile.id),
    best60(profile.id),
    xpPerDay(profile.id, 90),
    syncAchievements(profile.id).catch(() => [] as { key: string; unlockedAt: Date }[]),
  ]);
  const prog = levelProgress(profile.xp);
  const level = Math.max(profile.level, prog.level);
  const tier = tierForLevel(level);
  const tierLabel = t(`tier.${tier.id}` as DictKey);
  const rank = speedRankFor(b60);
  const nextRank = b60 !== null ? nextSpeedRank(b60) : null;
  const streak = effectiveStreak({ current: profile.streakCurrent, best: profile.streakBest, lastDay: profile.lastActiveDay }, dayKey());
  const unlocked = new Map(achs.map((a) => [a.key, a.unlockedAt]));
  const xp90 = [...xpDays.values()].reduce((a, b) => a + b, 0);
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
      <div className="card overflow-hidden">
        <div
          className="grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center"
          style={{ backgroundImage: `radial-gradient(90% 120% at 0% 0%, color-mix(in srgb, ${tier.color} 9%, transparent), transparent 60%)` }}
        >
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <svg viewBox="0 0 96 96" width={92} height={92} aria-hidden="true" className="-rotate-90">
                <circle cx="48" cy="48" r="44" fill="none" stroke="var(--bg)" strokeWidth="5" />
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  fill="none"
                  stroke={tier.color}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 44} ${2 * Math.PI * 44}`}
                  strokeDashoffset={2 * Math.PI * 44 * (1 - prog.frac)}
                  className="ring-arc"
                  style={{ ["--ring-c" as string]: 2 * Math.PI * 44 }}
                />
              </svg>
              <div className="absolute inset-[10px] grid place-items-center rounded-full bg-bg text-2xl font-semibold text-text" aria-hidden="true">
                {initials}
              </div>
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-md bg-sub-alt p-0.5">
                <LevelBadge level={level} size="md" title={t("xp.level", { n: level })} />
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-3xl text-text">{profile.username}</h1>
              <div className="text-sm text-sub">{t("profile.joined", { date: formatDate(profile.createdAt, months) })}</div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <TierChip level={level} label={tierLabel} />
                {rank ? <SpeedRankChip rank={rank} label={t(`rank.${rank.id}` as DictKey)} /> : null}
                {streak > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-bg px-2.5 py-1 text-xs leading-none text-main" title={t("streak.best", { n: profile.streakBest })}>
                    <FlameIcon size={12} />
                    {t("streak.daysLong", { n: streak })}
                  </span>
                ) : null}
              </div>
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
          <div className="flex min-w-0 flex-col gap-3 md:border-l-4 md:border-bg md:pl-8">
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                <span className="text-text">
                  {t("xp.level", { n: level })} <span className="text-sub">· {fmtInt(profile.xp)} XP</span>
                </span>
                <span className="text-xs text-sub">{prog.max ? t("xp.maxLevel") : t("xp.toNext", { n: fmtInt(prog.toNext) })}</span>
              </div>
              <span className="relative block h-2 overflow-hidden rounded-full bg-bg">
                <span className="xp-fill absolute inset-0 origin-left rounded-full" style={{ transform: `scaleX(${prog.frac})`, background: tier.color }} />
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
              <span className="text-sub">{t("xp.speedRank")}:</span>
              {b60 === null ? (
                <span className="text-sub">{t("xp.speedRankNone")}</span>
              ) : (
                <>
                  <span style={{ color: rank ? readable(rank.color) : undefined }}>{t("xp.best60", { n: Math.round(b60) })}</span>
                  <span className="text-sub">· {nextRank ? t("xp.speedRankNext", { n: nextRank.need, rank: t(`rank.${nextRank.rank.id}` as DictKey) }) : t("xp.speedRankTop")}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t-4 border-bg px-6 py-5 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col justify-between gap-1" title={k === t("profile.timeTyping") ? formatDuration(profile.timeTyping) : undefined}>
              <dt className="text-xs leading-snug text-sub">{k}</dt>
              <dd className="font-typing text-2xl whitespace-nowrap text-text tabular">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Section title={t("profile.achievements")} right={<span className="text-xs text-sub tabular">{unlocked.size} / {ACHIEVEMENTS.length}</span>}>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
          {ACHIEVEMENTS.map((a) => {
            const at = unlocked.get(a.id);
            const name = t(`ach.${a.id}.name` as DictKey);
            const desc = t(`ach.${a.id}.desc` as DictKey);
            return (
              <li
                key={a.id}
                title={`${name} — ${desc}${at ? ` · ${t("profile.unlockedOn", { date: formatDate(at, months) })}` : ` · ${t("profile.locked")}`}`}
                className={`lift card flex flex-col items-center gap-2 px-2 py-4 text-center ${at ? "" : "opacity-45 grayscale"}`}
              >
                <span
                  className={`grid h-11 w-11 place-items-center rounded-full ${at ? "bg-main text-bg" : "bg-bg text-sub"}`}
                  style={at ? { boxShadow: "0 0 16px color-mix(in srgb, var(--main) 35%, transparent)" } : undefined}
                >
                  <AchievementIcon icon={a.icon} size={20} />
                </span>
                <span className="text-xs leading-tight text-text">{name}</span>
                <span className="text-[0.68rem] leading-snug text-sub">{desc}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t("xp.history")} right={<span className="text-xs text-sub">{t("xp.historyNote")} · <span className="tabular">{fmtInt(xp90)} XP</span></span>}>
        <div className="card p-4">
          <XpChart perDay={xpDays} months={months} tip={(date, n) => t("xp.dayTip", { date, n })} />
        </div>
      </Section>

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
