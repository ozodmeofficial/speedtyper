"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/providers/I18nProvider";
import { levelProgress, tierForLevel, type XpAward } from "@/lib/xp";
import { ACHIEVEMENTS } from "@/lib/achievements";
import type { DictKey } from "@/lib/i18n";
import { confetti, prefersReducedMotion } from "@/lib/client/motion";
import { AnimatedNumber } from "./AnimatedNumber";
import { AchievementIcon, FlameIcon, LevelBadge, readable } from "./Badges";

const tierKey = (level: number) => `tier.${tierForLevel(level).id}` as DictKey;

/** XP gained on the result screen: bar fill, level-up pop, unlocked achievements. */
export function XpPanel({
  award,
  pending,
  guestXp,
  effects,
}: {
  award: XpAward | null;
  pending: boolean;
  /** XP a guest would have earned (null when signed in) */
  guestXp: number | null;
  effects: boolean;
}) {
  const t = useT();
  const fillRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const [shownLevel, setShownLevel] = useState<number | null>(award ? award.prevLevel : null);
  const [leveled, setLeveled] = useState(false);

  useEffect(() => {
    if (!award) return;
    const fill = fillRef.current;
    const before = levelProgress(award.prevXp);
    const after = levelProgress(award.xp);
    const levelUp = award.level > award.prevLevel;
    const animate = effects && !prefersReducedMotion();
    if (!fill || !animate) {
      setShownLevel(award.level);
      setLeveled(levelUp);
      if (fill) fill.style.transform = `scaleX(${after.frac})`;
      return;
    }
    setShownLevel(award.prevLevel);
    let cancelled = false;
    const opts = { duration: 750, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "forwards" as const };
    const run = async () => {
      if (levelUp) {
        await fill.animate([{ transform: `scaleX(${before.frac})` }, { transform: "scaleX(1)" }], { ...opts, delay: 350 }).finished.catch(() => undefined);
        if (cancelled) return;
        setShownLevel(award.level);
        setLeveled(true);
        const r = badgeRef.current?.getBoundingClientRect();
        confetti(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, count: 70, duration: 900 } : { count: 70 });
        await fill.animate([{ transform: "scaleX(0)" }, { transform: `scaleX(${after.frac})` }], opts).finished.catch(() => undefined);
      } else {
        await fill.animate([{ transform: `scaleX(${before.frac})` }, { transform: `scaleX(${after.frac})` }], { ...opts, delay: 350 }).finished.catch(() => undefined);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [award, effects]);

  if (guestXp !== null) {
    if (guestXp <= 0) return null;
    return (
      <div className="reveal card flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 text-sm" style={{ ["--d" as string]: "380ms" }}>
        <span className="font-typing text-lg text-sub">+{guestXp} XP</span>
        <Link href="/login" className="text-sub underline decoration-sub/50 underline-offset-4 transition-colors hover:text-text">
          {t("xp.guestEarned", { n: guestXp })}
        </Link>
      </div>
    );
  }

  if (!award) {
    if (!pending) return null;
    return (
      <div className="card flex h-[4.75rem] items-center gap-4 px-5 opacity-60" aria-hidden="true">
        <span className="h-7 w-7 animate-pulse rounded-md bg-bg" />
        <span className="h-1.5 flex-1 animate-pulse rounded-full bg-bg" />
      </div>
    );
  }

  const level = shownLevel ?? award.level;
  const after = levelProgress(award.xp);
  const tier = tierForLevel(level);
  const newTier = leveled && tierForLevel(award.prevLevel).id !== tierForLevel(award.level).id;
  const achievements = ACHIEVEMENTS.filter((a) => award.achievements.includes(a.id));

  return (
    <div className="reveal flex flex-col gap-3" style={{ ["--d" as string]: "380ms" }} aria-live="polite">
      <div className="card flex items-center gap-4 px-5 py-4">
        <span ref={badgeRef} key={level} className={leveled ? "lvl-pop lvl-burst rounded-md" : ""} style={{ ["--burst" as string]: tier.color }}>
          <LevelBadge level={level} size="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">
              {leveled ? (
                <span className="glow-text font-medium text-main">{t("xp.levelUp")}</span>
              ) : (
                <span className="text-sub">{t("xp.level", { n: level })}</span>
              )}
              <span className="ml-2 text-xs" style={{ color: readable(tier.color) }}>
                {newTier ? t("xp.newTier", { tier: t(tierKey(award.level)) }) : t(tierKey(level))}
              </span>
            </span>
            <span className="font-typing text-lg whitespace-nowrap text-main">
              +<AnimatedNumber value={award.gained} from={effects ? 0 : award.gained} duration={900} delay={300} animate={effects} />
              <span className="ml-1 font-sans text-xs text-sub">XP</span>
            </span>
          </div>
          <span className="relative mt-2 block h-1.5 overflow-hidden rounded-full bg-bg">
            <span
              ref={fillRef}
              className="absolute inset-0 origin-left rounded-full"
              style={{ transform: `scaleX(${effects ? levelProgress(award.prevXp).frac : after.frac})`, background: tier.color, willChange: "transform" }}
            />
          </span>
          <div className="mt-1.5 flex justify-between gap-3 text-xs text-sub">
            <span>{after.max ? t("xp.maxLevel") : t("xp.toNext", { n: after.toNext })}</span>
            {award.streak > 0 ? (
              <span className="flex items-center gap-1" title={t("streak.best", { n: award.streakBest })}>
                <FlameIcon size={12} className="text-main" />
                {t("streak.daysLong", { n: award.streak })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {achievements.length ? (
        <div className="flex flex-wrap gap-2">
          {achievements.map((a, i) => (
            <div key={a.id} className="reveal card flex items-center gap-3 px-4 py-2.5 text-sm" style={{ ["--d" as string]: `${900 + i * 120}ms` }}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-bg text-main">
                <AchievementIcon icon={a.icon} size={17} />
              </span>
              <span>
                <span className="block text-xs text-sub">{t("result.achievement")}</span>
                <span className="text-text">{t(`ach.${a.id}.name` as DictKey)}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
