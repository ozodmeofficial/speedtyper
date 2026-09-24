"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/AppProvider";
import { useT } from "@/components/providers/I18nProvider";
import { FlagIcon, GearIcon, InfoIcon, KeyboardIcon, LogoMark, TrophyIcon, UserIcon } from "@/components/ui/icons";
import type { DictKey } from "@/lib/i18n";

const NAV: { href: string; key: DictKey; Icon: typeof KeyboardIcon }[] = [
  { href: "/", key: "nav.test", Icon: KeyboardIcon },
  { href: "/race", key: "nav.race", Icon: FlagIcon },
  { href: "/leaderboard", key: "nav.leaderboard", Icon: TrophyIcon },
  { href: "/about", key: "nav.about", Icon: InfoIcon },
  { href: "/settings", key: "nav.settings", Icon: GearIcon },
];

export function Header() {
  const t = useT();
  const { user } = useApp();
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
      <div className="ml-auto flex items-center">
        <Link
          href={accountHref}
          title={user ? t("nav.profile") : t("nav.login")}
          className="text-btn flex h-9 items-center gap-2 px-1 text-sm"
        >
          <UserIcon size={19} />
          {user ? <span className="hidden max-w-40 truncate sm:inline">{user.username}</span> : null}
        </Link>
      </div>
    </header>
  );
}
