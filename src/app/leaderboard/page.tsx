import type { Metadata } from "next";
import Link from "next/link";
import { getRequestContext } from "@/server/context";
import { allTime, daily, raceBoard, userRank, type LbRow } from "@/server/leaderboard";
import { BOARD_LANGS, BOARD_TIMES } from "@/lib/anticheat";
import { languageInfo } from "@/lib/typing/words";
import { fmt, formatDate } from "@/lib/format";
import { CrownIcon } from "@/components/ui/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestContext();
  return { title: t("lb.title"), alternates: { canonical: "/leaderboard" } };
}

type SP = Promise<Record<string, string | string[] | undefined>>;

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "page" : undefined} className={`btn px-3.5 py-1.5 text-sm ${active ? "active" : ""}`}>
      {children}
    </Link>
  );
}

function Medal({ rank }: { rank: number }) {
  if (rank > 3) return <span className="tabular">{rank}</span>;
  const color = rank === 1 ? "#e2b714" : rank === 2 ? "#b8c0cc" : "#cd7f32";
  return (
    <span className="inline-flex items-center" style={{ color }} title={String(rank)}>
      <CrownIcon size={16} />
    </span>
  );
}

export default async function LeaderboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { t, dict, user } = await getRequestContext();
  const type = sp.type === "daily" ? "daily" : sp.type === "race" ? "race" : "all";
  const time = BOARD_TIMES.includes(sp.time as never) ? (sp.time as string) : "60";
  const lang = BOARD_LANGS.includes(sp.lang as never) ? (sp.lang as string) : "english";
  const board = `time_${time}_${lang}`;
  const q = (p: Record<string, string>) => {
    const u = new URLSearchParams({ type, time, lang, ...p });
    if (u.get("type") === "race") {
      u.delete("time");
      u.delete("lang");
    }
    return `/leaderboard?${u.toString()}`;
  };
  const months = dict["months.short"];

  let rows: LbRow[] = [];
  let mine: LbRow | null = null;
  const raceRows = type === "race" ? await raceBoard() : [];
  if (type !== "race") {
    [rows, mine] = await Promise.all([
      type === "daily" ? daily(board) : allTime(board),
      user ? userRank(board, user.id, type) : Promise.resolve(null),
    ]);
  }

  return (
    <div className="mx-auto w-full py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl text-text">{t("lb.title")}</h1>
        <div className="flex flex-wrap gap-2">
          <Tab href={q({ type: "all" })} active={type === "all"}>
            {t("lb.allTime")}
          </Tab>
          <Tab href={q({ type: "daily" })} active={type === "daily"}>
            {t("lb.daily")}
          </Tab>
          <Tab href={q({ type: "race" })} active={type === "race"}>
            {t("lb.races")}
          </Tab>
        </div>
      </div>

      {type !== "race" ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {BOARD_TIMES.map((n) => (
            <Tab key={n} href={q({ time: n })} active={time === n}>
              {t("lb.time", { n })}
            </Tab>
          ))}
          <span className="mx-2 h-6 w-[3px] rounded-full bg-sub-alt" aria-hidden="true" />
          {BOARD_LANGS.map((l) => (
            <Tab key={l} href={q({ lang: l })} active={lang === l}>
              {languageInfo(l).label.toLowerCase()}
            </Tab>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        {type === "race" ? (
          raceRows.length === 0 ? (
            <p className="py-16 text-center text-sub">{t("lb.empty")}</p>
          ) : (
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
                {raceRows.map((r) => (
                  <tr key={r.userId} className={user?.id === r.userId ? "text-main" : ""}>
                    <td>
                      <Medal rank={r.rank} />
                    </td>
                    <td>
                      <Link href={`/u/${r.username}`} className="hover:text-main">
                        {r.username}
                      </Link>
                    </td>
                    <td className="num">{fmt(r.avgWpm, 2)}</td>
                    <td className="num">{fmt(r.bestWpm, 2)}</td>
                    <td className="num">{r.races}</td>
                    <td className="num">{r.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sub">{t("lb.empty")}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="w-12">{t("table.rank")}</th>
                <th>{t("table.name")}</th>
                <th className="num">{t("table.wpm")}</th>
                <th className="num">{t("table.acc")}</th>
                <th className="num">{t("table.raw")}</th>
                <th className="num">{t("table.consistency")}</th>
                <th className="num">{t("table.date")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className={user?.id === r.userId ? "text-main" : ""}>
                  <td>
                    <Medal rank={r.rank} />
                  </td>
                  <td>
                    <Link href={`/u/${r.username}`} className="hover:text-main">
                      {r.username}
                    </Link>
                  </td>
                  <td className="num">{fmt(r.wpm, 2)}</td>
                  <td className="num">{fmt(r.acc, 2)}%</td>
                  <td className="num">{fmt(r.raw, 2)}</td>
                  <td className="num">{fmt(r.consistency, 2)}%</td>
                  <td className="num whitespace-nowrap text-sub">{formatDate(r.date, months)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {type !== "race" ? (
        <div className="sticky bottom-4 mt-6">
          <div className="card flex flex-wrap items-center gap-x-8 gap-y-1 px-4 py-3 text-sm shadow-lg">
            <span className="text-sub">{t("lb.yourRank")}</span>
            {!user ? (
              <Link href="/login" className="text-sub underline underline-offset-4 hover:text-text">
                {t("lb.signIn")}
              </Link>
            ) : mine ? (
              <>
                <span className="text-main tabular">#{mine.rank}</span>
                <span className="tabular">{fmt(mine.wpm, 2)} wpm</span>
                <span className="tabular text-sub">{fmt(mine.acc, 2)}%</span>
                <span className="ml-auto text-sub">{formatDate(mine.date, months)}</span>
              </>
            ) : (
              <span className="text-sub">{t("lb.notRanked")}</span>
            )}
          </div>
          <p className="mt-3 text-xs text-sub">{type === "daily" ? t("lb.dailyNote") : null}</p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-sub">{t("lb.racesNote")}</p>
      )}
    </div>
  );
}
