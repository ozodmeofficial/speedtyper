"use client";

/**
 * Home dashboard around the typing test (settings.dashboard): level strip, live
 * stat cards, progress, daily goal and the three widgets under the test.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/components/providers/I18nProvider";
import { ChevronRightIcon, CrownIcon, RestartIcon, TargetIcon, TrophyIcon, UsersIcon, BoltIcon } from "@/components/ui/icons";
import { FlameIcon } from "@/components/xp/Badges";
import { AnimatedNumber } from "@/components/xp/AnimatedNumber";
import { levelProgress, tierForLevel, type UserProgress } from "@/lib/xp";
import { fmtInt } from "@/lib/format";
import { api } from "@/lib/client/api";
import type { DictKey } from "@/lib/i18n";

export const DAILY_GOAL = 3;

const Arrow = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

const ListIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </svg>
);

const GiftIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12 5 5 9-10" />
  </svg>
);

// ── level strip ─────────────────────────────────────────────────────────

export function LevelStrip({ progress, signedIn, streak, streakSafe }: { progress: UserProgress | null; signedIn: boolean; streak: number; streakSafe: boolean }) {
  const t = useT();
  const p = progress ? levelProgress(progress.xp) : null;
  return (
    <div className="card mx-auto flex w-full max-w-[56rem] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="tile !h-11 !w-11" style={p ? { color: tierForLevel(p.level).color } : undefined}>
          <CrownIcon size={20} />
        </span>
        {p ? (
          <>
            <span className="shrink-0 text-lg font-semibold whitespace-nowrap">
              {t("dash.levelWord")} <span className="text-main tabular">{p.level}</span>
            </span>
            <div className="meter hidden min-w-16 flex-1 sm:block">
              <span className="xp-fill" style={{ transform: `scaleX(${p.max ? 1 : p.frac})` }} />
            </div>
            <span className="shrink-0 text-sm text-sub tabular">
              <span className="text-main">{fmtInt(p.into)}</span> / {p.max ? "∞" : fmtInt(p.span)} XP
            </span>
          </>
        ) : (
          <>
            <span className="shrink-0 text-lg font-semibold">{t("dash.guest")}</span>
            <span className="hidden min-w-0 flex-1 truncate text-sm text-sub sm:block">{t("dash.guestReward")}</span>
            {!signedIn ? (
              <Link href="/login" className="btn btn-primary ml-auto hidden shrink-0 !rounded-full !px-4 !py-1.5 text-sm sm:inline-flex">
                {t("dash.signIn")}
              </Link>
            ) : null}
          </>
        )}
      </div>
      <span className="hidden h-10 w-px bg-line sm:block" aria-hidden="true" />
      <div className="flex shrink-0 items-center gap-3" title={streak > 0 ? (streakSafe ? t("streak.safe") : t("streak.keep")) : t("streak.start")}>
        <span className={`tile !h-11 !w-11 ${streak > 0 && streakSafe ? "" : "muted"}`}>
          <FlameIcon size={22} />
        </span>
        <span className="leading-tight">
          <span className="block text-lg font-semibold text-main tabular">{t("dash.streakDays", { n: streak })}</span>
          <span className="block text-xs text-sub">{t("dash.streakLabel")}</span>
        </span>
      </div>
    </div>
  );
}

// ── live stat cards ──────────────────────────────────────────────────────

function StatCard({ icon, label, children, extra }: { icon: React.ReactNode; label: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="card flex min-w-0 items-center gap-3.5 px-4 py-3.5">
      <span className="tile">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-sub">{label}</div>
        <div className="mt-0.5 text-[1.65rem] leading-none font-semibold text-text tabular">{children}</div>
      </div>
      {extra ? <div className="shrink-0 self-end text-xs">{extra}</div> : null}
    </div>
  );
}

function Delta({ v, suffix = "" }: { v: number | null; suffix?: string }) {
  if (v === null || v === 0) return null;
  const up = v > 0;
  return (
    <span className={`flex items-center gap-0.5 tabular ${up ? "text-[#4ade80]" : "text-error"}`}>
      <span className={up ? "" : "rotate-180"}>
        <Arrow />
      </span>
      {up ? "+" : ""}
      {v}
      {suffix}
    </span>
  );
}

export function LiveStats({
  wpm,
  acc,
  combo,
  correct,
  xp,
  started,
  last,
  effects,
}: {
  wpm: number;
  acc: number;
  combo: number;
  correct: number;
  xp: number;
  started: boolean;
  /** previous test (for the deltas) */
  last: { wpm: number; acc: number } | null;
  effects: boolean;
}) {
  const t = useT();
  const w = Math.round(wpm);
  const a = Math.floor(acc);
  return (
    <div className={`grid grid-cols-2 gap-3 transition-opacity duration-300 lg:grid-cols-4 ${started ? "" : "opacity-70"}`}>
      <StatCard icon={<BoltIcon size={20} />} label={t("dash.wpm")} extra={started && last ? <Delta v={w - Math.round(last.wpm)} /> : null}>
        <AnimatedNumber value={w} duration={500} animate={effects} />
      </StatCard>
      <StatCard icon={<TargetIcon size={20} />} label={t("dash.acc")} extra={started && last ? <Delta v={a - Math.floor(last.acc)} suffix="%" /> : null}>
        {a}%
      </StatCard>
      <StatCard
        icon={<FlameIcon size={20} />}
        label={t("dash.combo")}
        extra={
          combo >= 10 ? (
            <span className="fade-in flex items-center gap-1 rounded-full bg-[var(--main-soft)] px-2 py-1 text-main shadow-[inset_0_0_0_1px_var(--main-line)]">
              <FlameIcon size={11} />
              {combo >= 25 ? t("dash.fire") : t("dash.great")}
            </span>
          ) : null
        }
      >
        {combo}
        <span className="ml-0.5 text-lg text-sub">×</span>
      </StatCard>
      <StatCard
        icon={<ListIcon />}
        label={t("dash.correct")}
        extra={xp > 0 ? <span className="flex items-center gap-1 font-medium text-main tabular">✦ +{xp} XP</span> : null}
      >
        {correct}
      </StatCard>
    </div>
  );
}

// ── progress row ─────────────────────────────────────────────────────────

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

export function ProgressRow({ frac, done, total, time }: { frac: number; done: number; total: number; time: boolean }) {
  return (
    <div className="mt-5 flex items-center gap-4 px-1">
      <div className="meter flex-1">
        <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, frac))})`, transition: time ? "transform 1s linear" : undefined }} />
      </div>
      <span className="shrink-0 text-sm text-sub tabular">{time ? `${clock(done)} / ${clock(total)}` : `${done} / ${total || "∞"}`}</span>
    </div>
  );
}

// ── daily goal pill ──────────────────────────────────────────────────────

export function GoalPill({ today, href }: { today: number; href: string }) {
  const t = useT();
  const n = Math.min(today, DAILY_GOAL);
  const done = today >= DAILY_GOAL;
  return (
    <div className="mt-6 flex justify-center">
      <Link href={href} className="card card-hover group inline-flex items-center gap-2.5 !rounded-full px-5 py-2.5 text-sm">
        <span className="text-main">
          <TargetIcon size={18} />
        </span>
        <span className="font-semibold">{t("dash.goal")}</span>
        <span className="font-semibold text-main tabular">
          {n}/{DAILY_GOAL}
        </span>
        <span className="text-sub">{done ? t("dash.goalDone") : t("dash.goalTests")}</span>
        <span className="text-sub transition-transform group-hover:translate-x-0.5">
          <ChevronRightIcon size={15} />
        </span>
      </Link>
    </div>
  );
}

// ── widgets ──────────────────────────────────────────────────────────────

interface LeaderRow {
  rank: number;
  username: string;
  wpm: number;
}

export function Widgets({
  progress,
  username,
  challenge,
  board,
}: {
  progress: UserProgress | null;
  username: string | null;
  challenge: { target: number; best: number };
  board: { time: string; lang: string };
}) {
  const t = useT();
  const p = progress ? levelProgress(progress.xp) : null;
  const next = p ? Math.min(p.level + 1, 100) : 2;
  const nextTier = tierForLevel(next);
  const cDone = challenge.best >= challenge.target;
  const [rows, setRows] = useState<LeaderRow[] | null>(null);

  useEffect(() => {
    let off = false;
    void api<{ rows?: LeaderRow[] }>(`/api/leaderboard?type=speed&period=day&time=${board.time}&lang=${board.lang}`).then((r) => {
      if (!off) setRows(r.ok && Array.isArray(r.data.rows) ? r.data.rows : []);
    });
    return () => {
      off = true;
    };
  }, [board.time, board.lang]);

  const mine = username && rows ? rows.find((r) => r.username === username) : null;
  const shown = rows ? [...rows.slice(0, mine && mine.rank > 2 ? 1 : 2), ...(mine && mine.rank > 2 ? [mine] : [])] : [];

  return (
    <div className="mt-8 grid gap-4 md:grid-cols-3">
      {/* daily challenge */}
      <div className="card card-hover flex items-center gap-4 p-5">
        <span className="tile !h-12 !w-12" style={{ color: "#f5b942" }}>
          <TrophyIcon size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t("dash.challenge")}</div>
          <div className="mt-0.5 text-sm text-main">{t("dash.challengeDesc", { n: challenge.target })}</div>
          <div className="mt-3 flex items-center gap-3">
            <div className="meter flex-1">
              <span style={{ transform: `scaleX(${Math.min(1, challenge.best / challenge.target)})`, background: "linear-gradient(90deg,#f59e0b,#fbbf24)" }} />
            </div>
            <span className="shrink-0 text-xs text-sub tabular">
              {Math.round(challenge.best)} / {challenge.target}
            </span>
          </div>
        </div>
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center self-end rounded-full transition-colors ${cDone ? "bg-[#f5b942] text-bg" : "text-sub shadow-[inset_0_0_0_1.5px_var(--border-strong)]"}`}
          aria-label={cDone ? "✓" : undefined}
        >
          {cDone ? <CheckIcon /> : null}
        </span>
      </div>

      {/* next reward */}
      <div className="card card-hover flex items-center gap-4 p-5">
        <span className="tile !h-12 !w-12">
          <GiftIcon />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t("dash.nextReward")}</div>
          {p ? (
            <>
              <div className="mt-0.5 truncate text-sm text-main">
                {t("dash.nextLevel", { n: next })} · {t(`tier.${nextTier.id}` as DictKey)}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="meter flex-1">
                  <span style={{ transform: `scaleX(${p.max ? 1 : p.frac})` }} />
                </div>
                <span className="shrink-0 text-xs text-sub tabular">
                  {fmtInt(p.into)} / {p.max ? "∞" : fmtInt(p.span)} XP
                </span>
              </div>
            </>
          ) : (
            <Link href="/login" className="mt-1 block text-sm text-main hover:underline">
              {t("dash.guestReward")}
            </Link>
          )}
        </div>
        <span
          className="hidden h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_var(--border)] lg:block"
          aria-hidden="true"
          style={{
            background: `radial-gradient(circle at 50% 120%, color-mix(in srgb, ${nextTier.color} 70%, transparent), transparent 60%), linear-gradient(180deg, color-mix(in srgb, var(--bg) 80%, ${nextTier.color}), var(--bg))`,
          }}
        >
          <svg viewBox="0 0 72 72" className="h-full w-full">
            <path d="M0 52 L14 40 L24 46 L36 30 L48 44 L58 36 L72 46 V72 H0Z" fill={`color-mix(in srgb, ${nextTier.color} 25%, var(--bg))`} />
            <path d="M0 60 L18 52 L32 58 L46 50 L60 56 L72 52 V72 H0Z" fill="var(--bg)" opacity="0.85" />
          </svg>
        </span>
      </div>

      {/* leaders */}
      <div className="card card-hover flex flex-col p-5">
        <div className="flex items-center gap-3">
          <span className="text-sub">
            <UsersIcon size={20} />
          </span>
          <span className="flex-1 truncate font-semibold">{t("dash.leaders")}</span>
          <Link
            href={`/leaderboard?period=day&time=${board.time}&lang=${board.lang}`}
            className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs text-sub shadow-[inset_0_0_0_1px_var(--border-strong)] transition-colors hover:text-text"
          >
            {t("dash.seeAll")}
            <ChevronRightIcon size={12} />
          </Link>
        </div>
        <div className="mt-3 flex flex-1 flex-col justify-center gap-2">
          {rows === null ? (
            <div className="h-8 animate-pulse rounded-lg bg-[var(--hover)]" />
          ) : shown.length === 0 ? (
            <p className="text-sm text-sub">{t("dash.noLeaders")}</p>
          ) : (
            shown.map((r) => {
              const me = r.username === username;
              return (
                <Link key={r.username} href={`/u/${r.username}`} className={`flex items-center gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-[var(--hover)] ${me ? "text-main" : ""}`}>
                  <span className="w-8 text-base font-semibold tabular">#{r.rank}</span>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sub-alt text-xs font-semibold shadow-[inset_0_0_0_1px_var(--border-strong)]">
                    {r.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.username}</span>
                  <span className="shrink-0 text-sm text-sub tabular">{Math.round(r.wpm)} WPM</span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── call to action + key hints ───────────────────────────────────────────

export function AgainButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <div className="mt-8 flex justify-center">
      <button type="button" onClick={onClick} className="btn btn-primary group !rounded-2xl !px-9 !py-3.5 text-base">
        <RestartIcon size={18} className="transition-transform duration-300 group-hover:-rotate-180" />
        {t("dash.again")}
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </button>
    </div>
  );
}
