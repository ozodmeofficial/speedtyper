"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { useT } from "@/components/providers/I18nProvider";
import { FlagIcon, GearIcon, InfoIcon, KeyboardIcon, LogoMark, MoonIcon, SunIcon, TrophyIcon, UserIcon } from "@/components/ui/icons";
import { getTheme, toggledTheme } from "@/lib/themes";
import type { DictKey } from "@/lib/i18n";
import { levelProgress, tierForLevel } from "@/lib/xp";
import { fmtInt } from "@/lib/format";
import { FlameIcon, LevelBadge } from "@/components/xp/Badges";

const NAV: { href: string; key: DictKey; Icon: typeof KeyboardIcon }[] = [
  { href: "/", key: "nav.test", Icon: KeyboardIcon },
  { href: "/race", key: "nav.race", Icon: FlagIcon },
  { href: "/leaderboard", key: "nav.leaderboard", Icon: TrophyIcon },
  { href: "/about", key: "nav.about", Icon: InfoIcon },
  { href: "/settings", key: "nav.settings", Icon: GearIcon },
];

export function Header() {
  const t = useT();
  const { user, progress, settings, update } = useApp();
  const isLight = settings.useCustomTheme && settings.customTheme ? false : getTheme(settings.theme).light;
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const accountHref = user ? `/u/${user.username}` : "/login";

  return (
    <header className="page chrome flex h-[5rem] shrink-0 items-center gap-4 pt-3 sm:gap-6">
      <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="SpeedTyper">
        <LogoMark size={30} className="transition-transform duration-200 group-hover:-rotate-6" />
        <span className="display hidden text-[1.6rem] leading-none text-text min-[420px]:inline">
          Speed<span className="text-main">Typer</span>
        </span>
      </Link>
      <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]" aria-label="main">
        {NAV.map(({ href, key, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              title={t(key)}
              aria-label={t(key)}
              aria-current={active ? "page" : undefined}
              className={`flex h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors ${
                active ? "bg-sub-alt text-text shadow-[inset_0_0_0_1px_var(--border)]" : "text-sub hover:bg-[var(--hover)] hover:text-text"
              }`}
            >
              <Icon size={17} />
              <span className="hidden lg:inline">{t(key)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {user && progress ? <ProgressChip level={progress.level} xp={progress.xp} streak={progress.streak} streakSafe={progress.streakToday} href={accountHref} effects={settings.effects} /> : null}
        {!user ? (
          <Link href="/login" className="group hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs text-sub transition-colors hover:bg-sub-alt hover:text-text xl:flex">
            <LevelBadge level={1} size="xs" className="opacity-70 transition-opacity group-hover:opacity-100" />
            {t("xp.guestPrompt")}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => update({ theme: toggledTheme(settings.useCustomTheme ? "claude-dark" : settings.theme), useCustomTheme: false })}
          title={isLight ? t("theme.dark") : t("theme.light")}
          aria-label={isLight ? t("theme.dark") : t("theme.light")}
          className="text-btn grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--hover)]"
        >
          {isLight ? <MoonIcon size={17} /> : <SunIcon size={17} />}
        </button>
        <Link
          href={accountHref}
          title={user ? t("nav.profile") : t("nav.login")}
          aria-label={user ? `${t("nav.profile")}: ${user.username}` : t("nav.login")}
          className={`flex h-9 items-center gap-2 rounded-full text-sm transition-colors ${
            user ? "px-2 text-sub hover:bg-[var(--hover)] hover:text-text sm:pr-3.5" : "bg-text px-3.5 text-bg hover:opacity-90"
          }`}
        >
          {user ? (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-main text-[0.7rem] font-semibold text-bg" aria-hidden="true">
              {user.username.slice(0, 1).toUpperCase()}
            </span>
          ) : (
            <UserIcon size={16} />
          )}
          <span className={user ? "hidden max-w-36 truncate sm:inline" : "hidden sm:inline"}>{user ? user.username : t("nav.login")}</span>
        </Link>
      </div>
    </header>
  );
}

function ProgressChip({ level, xp, streak, streakSafe, href, effects }: { level: number; xp: number; streak: number; streakSafe: boolean; href: string; effects: boolean }) {
  const t = useT();
  const p = levelProgress(xp);
  const tier = tierForLevel(level);
  const prev = useRef(level);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (level > prev.current && effects) setBump((b) => b + 1);
    prev.current = level;
  }, [level, effects]);
  const tip = [
    t("xp.headerTip", { level: t("xp.level", { n: level }), tier: t(`tier.${tier.id}` as DictKey), xp: fmtInt(xp) }),
    p.max ? t("xp.maxLevel") : t("xp.toNext", { n: fmtInt(p.toNext) }),
    streak > 0 ? t("streak.daysLong", { n: streak }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href={href} title={tip} aria-label={tip} className="group flex h-9 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-sub-alt">
      <span key={bump} className={bump ? "lvl-bump inline-flex" : "inline-flex"}>
        <LevelBadge level={level} />
      </span>
      <span className="relative hidden h-1 w-14 overflow-hidden rounded-full bg-sub-alt transition-colors group-hover:bg-bg sm:block" aria-hidden="true">
        <span className="xp-fill absolute inset-0 origin-left rounded-full" style={{ transform: `scaleX(${p.frac})`, background: tier.color }} />
      </span>
      {streak > 0 ? (
        <span className={`flex items-center gap-0.5 text-xs tabular ${streakSafe ? "text-main" : "text-sub"}`}>
          <FlameIcon size={12} />
          {streak}
        </span>
      ) : null}
    </Link>
  );
}
