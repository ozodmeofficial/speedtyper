import type { Metadata } from "next";
import Link from "next/link";
import { getRequestContext } from "@/server/context";
import { overall, overallRank, raceBoard, speed, speedRank, weekly, weeklyRank, type LbRow, type Paged, type RaceLbRow, type XpLbRow } from "@/server/leaderboard";
import { isMetric, isPeriod, PERIODS, type Metric, type Period } from "@/lib/periods";
import { BOARD_LANGS, BOARD_TIMES } from "@/lib/anticheat";
import { languageInfo } from "@/lib/typing/words";
import { fmt, fmtInt, formatDate } from "@/lib/format";
import { BoltIcon, ChevronLeftIcon, ChevronRightIcon, CrownIcon, FlagIcon } from "@/components/ui/icons";
import { LevelBadge, TierChip } from "@/components/xp/Badges";
import { tierForLevel } from "@/lib/xp";
import type { DictKey } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestContext();
  return { title: t("lb.title"), alternates: { canonical: "/leaderboard" } };
}

type SP = Promise<Record<string, string | string[] | undefined>>;
type LbType = "speed" | "xp" | "race";

const MEDALS = ["#d4a017", "#a8b0bc", "#c07a3a"];

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "page" : undefined} className="pill">
      {children}
    </Link>
  );
}

function Rank({ rank }: { rank: number }) {
  if (rank > 3) return <span className="text-sub tabular">{rank}</span>;
  return (
    <span className="inline-flex items-center" style={{ color: MEDALS[rank - 1] }} title={String(rank)}>
      <CrownIcon size={16} />
      <span className="sr-only">{rank}</span>
    </span>
  );
}

function Name({ username, level, me }: { username: string; level: number; me: boolean }) {
  return (
    <Link href={`/u/${username}`} className="group inline-flex max-w-full items-center gap-2.5">
      <LevelBadge level={level} size="xs" />
      <span className={`truncate transition-colors group-hover:text-main ${me ? "text-main" : ""}`}>{username}</span>
    </Link>
  );
}

interface PodiumItem {
  userId: string;
  username: string;
  level: number;
  value: string;
  unit: string;
  sub?: string;
}

/** Top 3 on the first page: 2 · 1 · 3 */
function Podium({ items, meId }: { items: PodiumItem[]; meId?: string }) {
  if (items.length === 0) return null;
  const order = [items[1], items[0], items[2]];
  return (
    <div className="mb-6 grid grid-cols-3 items-end gap-2 sm:gap-4">
      {order.map((it, i) => {
        if (!it) return <div key={i} />;
        const place = i === 1 ? 1 : i === 0 ? 2 : 3;
        const color = MEDALS[place - 1];
        const tier = tierForLevel(it.level);
        return (
          <Link
            key={it.userId}
            href={`/u/${it.username}`}
            className={`lift card group relative flex flex-col items-center gap-2 overflow-hidden px-2 text-center sm:px-4 ${place === 1 ? "pt-6 pb-5" : "pt-4 pb-4"} ${it.userId === meId ? "ring-2 ring-main/60" : ""}`}
            style={{ backgroundImage: `radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, ${color} ${place === 1 ? 16 : 10}%, transparent), transparent 70%)` }}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
              <CrownIcon size={place === 1 ? 20 : 16} />
              <span className="tabular">#{place}</span>
            </span>
            <span
              className={`grid place-items-center rounded-full bg-bg font-semibold text-text ${place === 1 ? "h-16 w-16 text-xl" : "h-12 w-12 text-base"}`}
              style={{ boxShadow: `0 0 0 2px ${color}, 0 0 18px color-mix(in srgb, ${color} 30%, transparent)` }}
              aria-hidden="true"
            >
              {it.username.slice(0, 2).toUpperCase()}
            </span>
            <span className="flex max-w-full items-center gap-1.5">
              <LevelBadge level={it.level} size="xs" />
              <span className="truncate text-sm text-text transition-colors group-hover:text-main">{it.username}</span>
            </span>
            <span className={`display leading-none text-text ${place === 1 ? "text-4xl" : "text-3xl"}`}>
              {it.value}
              <span className="ml-1 text-xs text-sub">{it.unit}</span>
            </span>
            {it.sub ? (
              <span className="hidden text-xs sm:block" style={{ color: `color-mix(in srgb, ${tier.color} 78%, var(--text))` }}>
                {it.sub}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

function Pager({ page, hasNext, href, t }: { page: number; hasNext: boolean; href: (p: number) => string; t: (k: DictKey, v?: Record<string, string | number>) => string }) {
  if (page === 1 && !hasNext) return null;
  const btn = "grid h-9 w-9 place-items-center rounded-lg";
  return (
    <nav className="mt-6 flex items-center justify-center gap-2 text-sm" aria-label="pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} scroll={false} className={`text-btn ${btn} hover:bg-sub-alt`} aria-label={t("common.prev")}>
          <ChevronLeftIcon size={18} />
        </Link>
      ) : (
        <span className={`${btn} text-sub opacity-30`} aria-hidden="true">
          <ChevronLeftIcon size={18} />
        </span>
      )}
      <span className="min-w-20 text-center text-sub tabular">{t("common.page", { n: page })}</span>
      {hasNext ? (
        <Link href={href(page + 1)} scroll={false} className={`text-btn ${btn} hover:bg-sub-alt`} aria-label={t("common.next")}>
          <ChevronRightIcon size={18} />
        </Link>
      ) : (
        <span className={`${btn} text-sub opacity-30`} aria-hidden="true">
          <ChevronRightIcon size={18} />
        </span>
      )}
    </nav>
  );
}

function Empty({ text, cta }: { text: string; cta: string }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <CrownIcon size={26} className="text-sub" />
      <p className="max-w-sm text-sub">{text}</p>
      <Link href="/" className="btn btn-primary mt-2 px-4 py-2 text-sm">
        {cta}
      </Link>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
    </div>
  );
}

const PERIOD_KEY: Record<Period, DictKey> = { day: "lb.today", month: "lb.month", year: "lb.year", all: "lb.allTime" };
const PERIOD_NOTE: Record<Period, DictKey> = { day: "lb.dayNote", month: "lb.monthNote", year: "lb.yearNote", all: "lb.allNote" };

export default async function LeaderboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { t, dict, user } = await getRequestContext();
  // legacy links: ?type=overall|weekly|all|daily
  const rawType = sp.type;
  const type: LbType = rawType === "xp" || rawType === "overall" || rawType === "weekly" ? "xp" : rawType === "race" ? "race" : "speed";
  const xpScope = sp.xp === "week" || rawType === "weekly" ? "week" : "all";
  const period: Period = isPeriod(sp.period) ? sp.period : rawType === "daily" ? "day" : "all";
  const metric: Metric = isMetric(sp.metric) ? sp.metric : "wpm";
  const time = BOARD_TIMES.includes(sp.time as never) ? (sp.time as string) : "60";
  const lang = BOARD_LANGS.includes(sp.lang as never) ? (sp.lang as string) : "english";
  const page = Math.max(1, Math.min(20, Number(sp.page) || 1));

  const q = (p: Record<string, string>) => {
    const next: Record<string, string> = { type, period, metric, time, lang, xp: xpScope, ...p };
    const u = new URLSearchParams();
    if (next.type !== "speed") u.set("type", next.type);
    if (next.type === "xp" && next.xp === "week") u.set("xp", "week");
    if (next.type !== "xp" && next.period !== "all") u.set("period", next.period);
    if (next.type !== "xp" && next.metric !== "wpm") u.set("metric", next.metric);
    if (next.type === "speed" && next.time !== "60") u.set("time", next.time);
    if (next.type === "speed" && next.lang !== "english") u.set("lang", next.lang);
    if (p.page && p.page !== "1") u.set("page", p.page);
    const s = u.toString();
    return s ? `/leaderboard?${s}` : "/leaderboard";
  };
  const months = dict["months.short"];
  const tierName = (level: number) => t(`tier.${tierForLevel(level).id}` as DictKey);
  const unit = metric === "cpm" ? "cpm" : "wpm";
  const mv = (wpm: number, cpm: number) => (metric === "cpm" ? cpm : wpm);

  let wpmData: Paged<LbRow> | null = null;
  let wpmMine: LbRow | null = null;
  let xpData: Paged<XpLbRow> | null = null;
  let xpMine: XpLbRow | null = null;
  let raceRows: RaceLbRow[] = [];
  if (type === "speed") {
    const board = { time, language: lang, period, metric };
    [wpmData, wpmMine] = await Promise.all([speed(board, page), user ? speedRank(board, user.id) : Promise.resolve(null)]);
  } else if (type === "xp") {
    [xpData, xpMine] = await Promise.all([
      xpScope === "week" ? weekly(page) : overall(page),
      user ? (xpScope === "week" ? weeklyRank(user.id) : overallRank(user.id)) : Promise.resolve(null),
    ]);
  } else {
    raceRows = await raceBoard(period);
  }

  const note =
    type === "xp" ? (xpScope === "week" ? t("lb.weeklyNote") : t("lb.overallNote")) : type === "race" ? `${t(PERIOD_NOTE[period])} ${t("lb.racesNote")}` : t(PERIOD_NOTE[period]);
  const showPodium = page === 1;

  return (
    <div className="mx-auto w-full py-8">
      <div className="mb-7">
        <div className="eyebrow mb-2">SpeedTyper</div>
        <h1 className="text-4xl text-text">{t("lb.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-sub">{note}</p>
      </div>

      <div className="mb-6 flex flex-col gap-4">
        <div className="seg self-start" role="tablist">
          <Tab href={q({ type: "speed" })} active={type === "speed"}>
            <BoltIcon size={15} />
            {t("lb.speed")}
          </Tab>
          <Tab href={q({ type: "xp" })} active={type === "xp"}>
            <CrownIcon size={15} />
            {t("lb.xp")}
          </Tab>
          <Tab href={q({ type: "race" })} active={type === "race"}>
            <FlagIcon size={15} />
            {t("lb.races")}
          </Tab>
        </div>

        {type === "xp" ? (
          <div className="flex flex-wrap gap-2">
            <Chip href={q({ xp: "all" })} active={xpScope === "all"}>
              {t("lb.overall")}
            </Chip>
            <Chip href={q({ xp: "week" })} active={xpScope === "week"}>
              {t("lb.weekly")}
            </Chip>
          </div>
        ) : (
          <div className="card flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-3.5">
            <Filter label={t("lb.period")}>
              <div className="flex flex-wrap gap-1.5">
                {PERIODS.map((p) => (
                  <Chip key={p} href={q({ period: p })} active={period === p}>
                    {t(PERIOD_KEY[p])}
                  </Chip>
                ))}
              </div>
            </Filter>
            <Filter label={t("lb.metric")}>
              <div className="seg">
                <Tab href={q({ metric: "wpm" })} active={metric === "wpm"}>
                  WPM
                </Tab>
                <Tab href={q({ metric: "cpm" })} active={metric === "cpm"}>
                  CPM
                </Tab>
              </div>
            </Filter>
            {type === "speed" ? (
              <>
                <Filter label={t("lb.duration")}>
                  <div className="seg">
                    {BOARD_TIMES.map((n) => (
                      <Tab key={n} href={q({ time: n })} active={time === n}>
                        {n}s
                      </Tab>
                    ))}
                  </div>
                </Filter>
                <Filter label={t("table.language")}>
                  <div className="seg">
                    {BOARD_LANGS.map((l) => (
                      <Tab key={l} href={q({ lang: l })} active={lang === l}>
                        {languageInfo(l).label}
                      </Tab>
                    ))}
                  </div>
                </Filter>
              </>
            ) : null}
          </div>
        )}
      </div>

      {type === "xp" && xpData ? (
        xpData.rows.length === 0 ? (
          <Empty text={t("lb.empty")} cta={t("lb.cta")} />
        ) : (
          <>
            {showPodium ? (
              <Podium
                meId={user?.id}
                items={xpData.rows.slice(0, 3).map((r) => ({ userId: r.userId, username: r.username, level: r.level, value: fmtInt(r.xp), unit: "XP", sub: tierName(r.level) }))}
              />
            ) : null}
            {(showPodium ? xpData.rows.slice(3) : xpData.rows).length > 0 ? (
              <div className="card overflow-x-auto px-2 py-1">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-12">{t("table.rank")}</th>
                      <th>{t("table.name")}</th>
                      <th className="hidden sm:table-cell">{t("xp.tier")}</th>
                      <th className="num">{xpScope === "week" ? t("xp.weekly") : t("xp.total")}</th>
                      <th className="num">{t("table.tests")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showPodium ? xpData.rows.slice(3) : xpData.rows).map((r) => (
                      <tr key={r.userId} className={user?.id === r.userId ? "text-main" : ""}>
                        <td>
                          <Rank rank={r.rank} />
                        </td>
                        <td className="max-w-48">
                          <Name username={r.username} level={r.level} me={user?.id === r.userId} />
                        </td>
                        <td className="hidden sm:table-cell">
                          <TierChip level={r.level} label={tierName(r.level)} />
                        </td>
                        <td className="num font-typing">{fmtInt(r.xp)}</td>
                        <td className="num text-sub">{fmtInt(r.tests)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <Pager page={xpData.page} hasNext={xpData.hasNext} href={(p) => q({ page: String(p) })} t={t} />
          </>
        )
      ) : null}

      {type === "speed" && wpmData ? (
        wpmData.rows.length === 0 ? (
          <Empty text={period === "all" ? t("lb.empty") : t("lb.emptyPeriod")} cta={t("lb.cta")} />
        ) : (
          <>
            {showPodium ? (
              <Podium
                meId={user?.id}
                items={wpmData.rows.slice(0, 3).map((r) => ({
                  userId: r.userId,
                  username: r.username,
                  level: r.level,
                  value: fmt(mv(r.wpm, r.cpm), metric === "cpm" ? 0 : 1),
                  unit,
                  sub: `${metric === "cpm" ? `${fmt(r.wpm, 1)} wpm` : `${fmt(r.cpm, 0)} cpm`} · ${fmt(r.acc, 1)}%`,
                }))}
              />
            ) : null}
            {(showPodium ? wpmData.rows.slice(3) : wpmData.rows).length > 0 ? (
              <div className="card overflow-x-auto px-2 py-1">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-12">{t("table.rank")}</th>
                      <th>{t("table.name")}</th>
                      <th className="num">{metric === "cpm" ? "cpm" : t("table.wpm")}</th>
                      <th className="num">{metric === "cpm" ? t("table.wpm") : "cpm"}</th>
                      <th className="num">{t("table.acc")}</th>
                      <th className="num hidden sm:table-cell">{t("table.raw")}</th>
                      <th className="num hidden md:table-cell">{t("table.tests")}</th>
                      <th className="num hidden sm:table-cell">{t("table.date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showPodium ? wpmData.rows.slice(3) : wpmData.rows).map((r) => (
                      <tr key={r.userId} className={user?.id === r.userId ? "text-main" : ""}>
                        <td>
                          <Rank rank={r.rank} />
                        </td>
                        <td className="max-w-48">
                          <Name username={r.username} level={r.level} me={user?.id === r.userId} />
                        </td>
                        <td className="num font-typing text-text">{metric === "cpm" ? fmt(r.cpm, 0) : fmt(r.wpm, 2)}</td>
                        <td className="num text-sub">{metric === "cpm" ? fmt(r.wpm, 1) : fmt(r.cpm, 0)}</td>
                        <td className="num">{fmt(r.acc, 1)}%</td>
                        <td className="num hidden sm:table-cell">{fmt(r.raw, 1)}</td>
                        <td className="num hidden text-sub md:table-cell">{r.tests}</td>
                        <td className="num hidden whitespace-nowrap text-sub sm:table-cell">{formatDate(r.date, months)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <Pager page={wpmData.page} hasNext={wpmData.hasNext} href={(p) => q({ page: String(p) })} t={t} />
          </>
        )
      ) : null}

      {type === "race" ? (
        raceRows.length === 0 ? (
          <Empty text={t("lb.emptyRaces")} cta={t("lb.ctaRace")} />
        ) : (
          <>
            <Podium
              meId={user?.id}
              items={raceRows.slice(0, 3).map((r) => ({
                userId: r.userId,
                username: r.username,
                level: r.level,
                value: fmt(mv(r.avgWpm, r.avgWpm * 5), metric === "cpm" ? 0 : 1),
                unit,
                sub: t("lb.winsOf", { w: r.wins, n: r.races }),
              }))}
            />
            {raceRows.length > 3 ? (
              <div className="card overflow-x-auto px-2 py-1">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-12">{t("table.rank")}</th>
                      <th>{t("table.name")}</th>
                      <th className="num">{metric === "cpm" ? t("table.avgCpm") : t("table.avgWpm")}</th>
                      <th className="num">{metric === "cpm" ? t("table.bestCpm") : t("table.bestWpm")}</th>
                      <th className="num">{t("table.races")}</th>
                      <th className="num">{t("table.wins")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {raceRows.slice(3).map((r) => (
                      <tr key={r.userId} className={user?.id === r.userId ? "text-main" : ""}>
                        <td>
                          <Rank rank={r.rank} />
                        </td>
                        <td className="max-w-48">
                          <Name username={r.username} level={r.level} me={user?.id === r.userId} />
                        </td>
                        <td className="num font-typing text-text">{fmt(mv(r.avgWpm, r.avgWpm * 5), metric === "cpm" ? 0 : 2)}</td>
                        <td className="num">{fmt(mv(r.bestWpm, r.bestWpm * 5), metric === "cpm" ? 0 : 2)}</td>
                        <td className="num">{r.races}</td>
                        <td className="num">{r.wins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )
      ) : null}

      {type !== "race" ? (
        <div className="sticky bottom-4 z-10 mt-6">
          <div className="card flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm backdrop-blur">
            <span className="eyebrow">{t("lb.yourRank")}</span>
            {!user ? (
              <Link href="/login" className="text-sub underline decoration-sub/50 underline-offset-4 transition-colors hover:text-text">
                {type === "xp" ? t("xp.guestPrompt") : t("lb.signIn")}
              </Link>
            ) : type === "xp" && xpMine ? (
              <>
                <span className="display text-xl text-main tabular">#{xpMine.rank}</span>
                <span className="flex items-center gap-2">
                  <LevelBadge level={xpMine.level} size="xs" />
                  <span className="text-text">{xpMine.username}</span>
                </span>
                <span className="tabular">{fmtInt(xpMine.xp)} XP</span>
                <span className="ml-auto hidden sm:inline">
                  <TierChip level={xpMine.level} label={tierName(xpMine.level)} />
                </span>
              </>
            ) : type === "speed" && wpmMine ? (
              <>
                <span className="display text-xl text-main tabular">#{wpmMine.rank}</span>
                <span className="tabular text-text">{fmt(wpmMine.wpm, 2)} wpm</span>
                <span className="tabular">{fmt(wpmMine.cpm, 0)} cpm</span>
                <span className="tabular text-sub">{fmt(wpmMine.acc, 1)}%</span>
                <span className="ml-auto text-sub">{formatDate(wpmMine.date, months)}</span>
              </>
            ) : (
              <span className="text-sub">{t("lb.notRanked")}</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
