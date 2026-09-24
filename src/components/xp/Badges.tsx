/**
 * Level / tier / speed-rank / achievement visuals. No hooks: usable from server
 * and client components alike (labels are passed in already translated).
 */
import { tierForLevel, type SpeedRank } from "@/lib/xp";
import type { AchievementIcon as AchIconName } from "@/lib/achievements";

type Size = "xs" | "sm" | "md" | "lg";

const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
/** tier colour pulled towards the theme text colour so it reads on light and dark themes */
export const readable = (c: string) => `color-mix(in srgb, ${c} 78%, var(--text))`;

/** Compact level pill: tier-coloured, tabular number. */
export function LevelBadge({ level, size = "sm", title, className = "" }: { level: number; size?: Size; title?: string; className?: string }) {
  const tier = tierForLevel(level);
  const dims =
    size === "xs"
      ? "h-[1.15rem] min-w-[1.15rem] px-1 text-[0.62rem]"
      : size === "md"
        ? "h-7 min-w-7 px-2 text-sm"
        : size === "lg"
          ? "h-11 min-w-11 rounded-lg px-2.5 text-lg"
          : "h-[1.35rem] min-w-[1.35rem] px-1.5 text-[0.7rem]";
  const top = tier.id === "legend" || tier.id === "champion";
  return (
    <span
      title={title}
      className={`lvl-badge inline-flex shrink-0 items-center justify-center rounded-md font-semibold leading-none tabular ${dims} ${className}`}
      style={{
        color: readable(tier.color),
        background: top ? `linear-gradient(135deg, ${tint(tier.color, 30)}, ${tint(tier.color, 10)})` : tint(tier.color, 16),
        boxShadow: `inset 0 0 0 1px ${tint(tier.color, top ? 70 : 42)}`,
      }}
    >
      {level}
    </span>
  );
}

function TierGlyph({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 21 7v10l-9 5-9-5V7l9-5Z" fill={tint(color, 35)} stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function MedalGlyph({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 2h8l-2 6h-4L8 2Z" fill={tint(color, 45)} />
      <circle cx="12" cy="15" r="6.5" fill={tint(color, 30)} stroke={color} strokeWidth="2" />
      <path d="m12 12 1 2 2 .3-1.5 1.4.4 2.1L12 16.8l-1.9 1 .4-2.1L9 14.3l2-.3 1-2Z" fill={color} />
    </svg>
  );
}

/** Tier chip (name of the level tier). */
export function TierChip({ level, label, className = "" }: { level: number; label: string; className?: string }) {
  const tier = tierForLevel(level);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-none whitespace-nowrap ${className}`}
      style={{ color: readable(tier.color), background: tint(tier.color, 13) }}
    >
      <TierGlyph color={tier.color} />
      {label}
    </span>
  );
}

/** Speed rank chip (bronze … diamond). */
export function SpeedRankChip({ rank, label, className = "" }: { rank: SpeedRank; label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-none whitespace-nowrap ${className}`}
      style={{ color: readable(rank.color), background: tint(rank.color, 13) }}
    >
      <MedalGlyph color={rank.color} />
      {label}
    </span>
  );
}

const ACH_PATHS: Record<AchIconName, string> = {
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  stack: "M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 17.5l9 5 9-5",
  mountain: "m3 20 6.5-11 4 6.5 2.5-4L21 20H3ZM9.5 9l1.8 3",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  rocket: "M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2M9 12a22 22 0 0 1 8-9 7 7 0 0 1 4 4 22 22 0 0 1-9 8M9 12l3 3M9 12H5l2-4h4M12 15v4l4-2v-4",
  comet: "M21 3 10 14M15 3 7 11M21 9l-8 8M9.5 14.5a3.5 3.5 0 1 1-5 5 3.5 3.5 0 0 1 5-5Z",
  target: "M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12h.01",
  flame: "M12 22c4 0 7-2.7 7-7 0-4.5-4-7-4-11-3 1.5-5 4.5-5 7-1.2-.6-2-2-2-3.5C6 9 5 11.3 5 15c0 4.3 3 7 7 7Z",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
  crown: "m2.5 7 4.5 4 5-7 5 7 4.5-4-2 12h-15l-2-12Z",
  clock: "M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19ZM12 7v5l3 2",
};

export function AchievementIcon({ icon, size = 22 }: { icon: AchIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ACH_PATHS[icon]} />
    </svg>
  );
}

export function FlameIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 22c4 0 7-2.7 7-7 0-4.5-4-7-4-11-3 1.5-5 4.5-5 7-1.2-.6-2-2-2-3.5C6 9 5 11.3 5 15c0 4.3 3 7 7 7Z" />
    </svg>
  );
}
