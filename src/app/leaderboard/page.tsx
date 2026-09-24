import type { Metadata } from "next";
import Link from "next/link";
import { getRequestContext } from "@/server/context";
import {
  allTime,
  daily,
  overall,
  overallRank,
  raceBoard,
  userRank,
  weekly,
  weeklyRank,
  type LbRow,
  type Paged,
  type RaceLbRow,
  type XpLbRow,
} from "@/server/leaderboard";
import { BOARD_LANGS, BOARD_TIMES } from "@/lib/anticheat";
import { languageInfo } from "@/lib/typing/words";
import { fmt, fmtInt, formatDate } from "@/lib/format";
import { ChevronLeftIcon, ChevronRightIcon, CrownIcon } from "@/components/ui/icons";
import { LevelBadge, TierChip } from "@/components/xp/Badges";
import { tierForLevel } from "@/lib/xp";
import type { DictKey } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestContext();
  return { title: t("lb.title"), alternates: { canonical: "/leaderboard" } };
}

type SP = Promise<Record<string, string | string[] | undefined>>;
type LbType = "overall" | "weekly" | "all" | "daily" | "race";

const MEDALS = ["#e2b714", "#b8c0cc", "#cd7f32"];

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors ${active ? "bg-main text-bg" : "text-sub hover:bg-bg hover:text-text"}`}
    >
      {children}
    </Link>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "page" : undefined} className={`btn px-3 py-1 text-xs ${active ? "active" : ""}`}>
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
            <span className={`font-typing leading-none text-text ${place === 1 ? "text-3xl" : "text-2xl"}`}>
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

function Empty({ text }: { text: string }) {
  return <p className="card py-16 text-center text-sub">{text}</p>;
}

export default async function LeaderboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { t, dict, user } = await getRequestContext();
  const type: LbType = sp.type === "weekly" || sp.type === "all" || sp.type === "daily" || sp.type === "race" ? sp.type : "overall";
  const time = BOARD_TIMES.includes(sp.time as never) ? (sp.time as string) : "60";
  const lang = BOARD_LANGS.includes(sp.lang as never) ? (sp.lang as string) : "english";
  const page = Math.max(1, Math.min(20, Number(sp.page) || 1));
  const board = `time_${time}_${lang}`;
  const isWpm = type === "all" || type === "daily";
  const isXp = type === "overall" || type === "weekly";
  const q = (p: Record<string, string>) => {
    const u = new URLSearchParams({ type, time, lang, ...p });
    if (!("page" in p)) u.delete("page");
    if (u.get("page") === "1") u.delete("page");
    const ty = u.get("type");
    if (ty !== "all" && ty !== "daily") {
      u.delete("time");
      u.delete("lang");
    }
    if (ty === "overall") u.delete("type");
    const s = u.toString();
    return s ? `/leaderboard?${s}` : "/leaderboard";
  };
  const months = dict["months.short"];
  const tierName = (level: number) => t(`tier.${tierForLevel(level).id}` as DictKey);

  let wpmData: Paged<LbRow> | null = null;
  let wpmMine: LbRow | null = null;
  let xpData: Paged<XpLbRow> | null = null;
  let xpMine: XpLbRow | null = null;
  let raceRows: RaceLbRow[] = [];
  if (isWpm) {
    [wpmData, wpmMine] = await Promise.all([
      type === "daily" ? daily(board, page) : allTime(board, page),
      user ? userRank(board, user.id, type) : Promise.resolve(null),
    ]);
  } else if (isXp) {
    [xpData, xpMine] = await Promise.all([
      type === "weekly" ? weekly(page) : overall(page),
      user ? (type === "weekly" ? weeklyRank(user.id) : overallRank(user.id)) : Promise.resolve(null),
    ]);
  } else {
    raceRows = await raceBoard();
  }

  const note = type === "overall" ? t("lb.overallNote") : type === "weekly" ? t("lb.weeklyNote") : type === "daily" ? t("lb.dailyNote") : type === "race" ? t("lb.racesNote") : null;
  const showPodium = page === 1;

  return (
    <div className="mx-auto w-full py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-text">{t("lb.title")}</h1>
          {note ? <p className="mt-1.5 text-sm text-sub">{note}</p> : null}
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3">
        <div className="flex max-w-full items-center gap-1 self-start overflow-x-auto rounded-lg bg-sub-alt p-1 [scrollbar-width:none]" role="tablist">
          <Tab href={q({ type: "overall" })} active={type === "overall"}>
            {t("lb.overall")}
          </Tab>
          <Tab href={q({ type: "weekly" })} active={type === "weekly"}>
            {t("lb.weekly")}
          </Tab>
          <span className="mx-1 h-5 w-[2px] shrink-0 rounded-full bg-bg" aria-hidden="true" />
          <Tab href={q({ type: "all" })} active={type === "all"}>
            {t("lb.allTime")}
          </Tab>
          <Tab href={q({ type: "daily" })} active={type === "daily"}>
            {t("lb.daily")}
          </Tab>
          <span className="mx-1 h-5 w-[2px] shrink-0 rounded-full bg-bg" aria-hidden="true" />
          <Tab href={q({ type: "race" })} active={type === "race"}>
            {t("lb.races")}
          </Tab>
        </div>
        {isWpm ? (
          <div className="flex flex-wrap items-center gap-2">
            {BOARD_TIMES.map((n) => (
              <Chip key={n} href={q({ time: n })} active={time === n}>
                {t("lb.time", { n })}
              </Chip>
            ))}
            <span className="mx-1 h-5 w-[2px] rounded-full bg-sub-alt" aria-hidden="true" />
            {BOARD_LANGS.map((l) => (
              <Chip key={l} href={q({ lang: l })} active={lang === l}>
                {languageInfo(l).label.toLowerCase()}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      {isXp && xpData ? (
        xpData.rows.length === 0 ? (
          <Empty text={t("lb.empty")} />
        ) : (
          <>
            {showPodium ? (
              <Podium
                meId={user?.id}
                items={xpData.rows.slice(0, 3).map((r) => ({ userId: r.userId, username: r.username, level: r.level, value: fmtInt(r.xp), unit: "XP", sub: tierName(r.level) }))}
              />
            ) : null}
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-12">{t("table.rank")}</th>
                    <th>{t("table.name")}</th>
                    <th className="hidden sm:table-cell">{t("xp.tier")}</th>
                    <th className="num">{type === "weekly" ? t("xp.weekly") : t("xp.total")}</th>
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
            <Pager page={xpData.page} hasNext={xpData.hasNext} href={(p) => q({ page: String(p) })} t={t} />
          </>
        )
      ) : null}

      {isWpm && wpmData ? (
        wpmData.rows.length === 0 ? (
          <Empty text={t("lb.empty")} />
        ) : (
          <>
            {showPodium ? (
              <Podium
                meId={user?.id}
                items={wpmData.rows.slice(0, 3).map((r) => ({ userId: r.userId, username: r.username, level: r.level, value: fmt(r.wpm, 1), unit: "wpm", sub: `${fmt(r.acc, 1)}%` }))}
              />
            ) : null}
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-12">{t("table.rank")}</th>
                    <th>{t("table.name")}</th>
                    <th className="num">{t("table.wpm")}</th>
                    <th className="num">{t("table.acc")}</th>
                    <th className="num hidden sm:table-cell">{t("table.raw")}</th>
                    <th className="num hidden md:table-cell">{t("table.consistency")}</th>
                    <th className="num">{t("table.date")}</th>
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
                      <td className="num font-typing">{fmt(r.wpm, 2)}</td>
                      <td className="num">{fmt(r.acc, 2)}%</td>
                      <td className="num hidden sm:table-cell">{fmt(r.raw, 2)}</td>
                      <td className="num hidden md:table-cell">{fmt(r.consistency, 2)}%</td>
                      <td className="num whitespace-nowrap text-sub">{formatDate(r.date, months)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={wpmData.page} hasNext={wpmData.hasNext} href={(p) => q({ page: String(p) })} t={t} />
          </>
        )
      ) : null}

      {type === "race" ? (
        raceRows.length === 0 ? (
          <Empty text={t("lb.empty")} />
        ) : (
          <>
            <Podium
              meId={user?.id}
              items={raceRows.slice(0, 3).map((r) => ({ userId: r.userId, username: r.username, level: r.level, value: fmt(r.avgWpm, 1), unit: "wpm", sub: `${r.wins} / ${r.races}` }))}
            />
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-12">{t("table.rank")}</th>
                    <th>{t("table.name")}</th>
                    <th className="num">{t("table.avgWpm")}</th>
                    <th className="num">{t("table.bestWpm")}</th>
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
                      <td className="num font-typing">{fmt(r.avgWpm, 2)}</td>
                      <td className="num">{fmt(r.bestWpm, 2)}</td>
                      <td className="num">{r.races}</td>
                      <td className="num">{r.wins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : null}

      {type !== "race" ? (
        <div className="sticky bottom-4 z-10 mt-6">
          <div className="card flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm shadow-[0_8px_30px_rgba(0,0,0,0.25)] ring-1 ring-bg">
            <span className="text-sub">{t("lb.yourRank")}</span>
            {!user ? (
              <Link href="/login" className="text-sub underline decoration-sub/50 underline-offset-4 transition-colors hover:text-text">
                {isXp ? t("xp.guestPrompt") : t("lb.signIn")}
              </Link>
            ) : isXp && xpMine ? (
              <>
                <span className="font-typing text-lg text-main tabular">#{xpMine.rank}</span>
                <span className="flex items-center gap-2">
                  <LevelBadge level={xpMine.level} size="xs" />
                  <span className="text-text">{xpMine.username}</span>
                </span>
                <span className="tabular">{fmtInt(xpMine.xp)} XP</span>
                <span className="ml-auto hidden sm:inline">
                  <TierChip level={xpMine.level} label={tierName(xpMine.level)} />
                </span>
              </>
            ) : isWpm && wpmMine ? (
              <>
                <span className="font-typing text-lg text-main tabular">#{wpmMine.rank}</span>
                <span className="tabular">{fmt(wpmMine.wpm, 2)} wpm</span>
                <span className="tabular text-sub">{fmt(wpmMine.acc, 2)}%</span>
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
