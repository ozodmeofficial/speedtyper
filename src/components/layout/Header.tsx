"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { useT } from "@/components/providers/I18nProvider";
import { FlagIcon, GearIcon, InfoIcon, KeyboardIcon, LogoMark, TrophyIcon, UserIcon } from "@/components/ui/icons";
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
  const { user, progress, settings } = useApp();
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const accountHref = user ? `/u/${user.username}` : "/login";

  return (
    <header className="page chrome flex h-[5.5rem] shrink-0 items-center gap-6 pt-4 sm:gap-8">
      <Link href="/" className="group flex items-center gap-2.5" aria-label="SpeedTyper">
        <LogoMark size={30} />
        <span className="hidden text-[1.7rem] leading-none font-bold tracking-[-0.04em] text-text min-[420px]:inline">
          <span className="text-sub transition-colors group-hover:text-text">speed</span>typer
        </span>
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2" aria-label="main">
        {NAV.map(({ href, key, Icon }) => (
          <Link
            key={href}
            href={href}
            title={t(key)}
            aria-label={t(key)}
            aria-current={isActive(href) ? "page" : undefined}
            className={`text-btn grid h-9 w-9 place-items-center ${isActive(href) && href !== "/" ? "!text-text" : ""}`}
          >
            <Icon size={19} />
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        {user && progress ? <ProgressChip level={progress.level} xp={progress.xp} streak={progress.streak} streakSafe={progress.streakToday} href={accountHref} effects={settings.effects} /> : null}
        {!user ? (
          <Link href="/login" className="group hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs text-sub transition-colors hover:bg-sub-alt hover:text-text md:flex">
            <LevelBadge level={1} size="xs" className="opacity-70 transition-opacity group-hover:opacity-100" />
            {t("xp.guestPrompt")}
          </Link>
        ) : null}
        <Link
          href={accountHref}
          title={user ? t("nav.profile") : t("nav.login")}
          aria-label={user ? `${t("nav.profile")}: ${user.username}` : t("nav.login")}
          className="text-btn flex h-9 items-center gap-2 px-1 text-sm"
        >
          <UserIcon size={19} />
          {user ? <span className="hidden max-w-40 truncate sm:inline">{user.username}</span> : null}
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
