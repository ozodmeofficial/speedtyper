import { dayKey, dayKeyToUtcMidnight, formatDayKey } from "@/lib/format";

/** Server-rendered daily XP bars for the last `days` Tashkent days (oldest → newest). */
export function XpChart({ perDay, days = 90, months, tip }: { perDay: Map<number, number>; days?: number; months: string; tip: (date: string, n: number) => string }) {
  const today = dayKey();
  const todayMs = dayKeyToUtcMidnight(today) + 12 * 3600_000;
  const keys = Array.from({ length: days }, (_, i) => dayKey(todayMs - (days - 1 - i) * 86400_000));
  const values = keys.map((k) => perDay.get(k) ?? 0);
  const max = Math.max(10, ...values);
  const yMax = Math.ceil(max / 10) * 10;
  const W = 1000;
  const H = 150;
  const padL = 40;
  const padB = 20;
  const padT = 8;
  const w = W - padL;
  const h = H - padT - padB;
  const bw = w / days;
  const monthNames = months.split(",");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="xp history">
      {[0, 0.5, 1].map((f) => {
        const y = padT + h - f * h;
        return (
          <g key={f}>
            <line x1={padL} x2={W} y1={y} y2={y} stroke="var(--bg)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={padL - 8} y={y} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--sub)">
              {Math.round(yMax * f)}
            </text>
          </g>
        );
      })}
      {keys.map((k, i) => {
        const v = values[i];
        const bh = v > 0 ? Math.max(2, (v / yMax) * h) : 0;
        const x = padL + i * bw;
        const d = k % 100;
        return (
          <g key={k}>
            <rect x={x + 1} y={padT} width={Math.max(1, bw - 2)} height={h} fill="transparent">
              <title>{tip(formatDayKey(k, months), v)}</title>
            </rect>
            {v > 0 ? (
              <rect x={x + 1.5} y={padT + h - bh} width={Math.max(1, bw - 3)} height={bh} rx={2} fill="var(--main)" opacity={k === today ? 1 : 0.75} pointerEvents="none" />
            ) : null}
            {d === 1 ? (
              <text x={x + 2} y={H - 4} fontSize={11} fill="var(--sub)">
                {monthNames[Math.floor((k % 10000) / 100) - 1]}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
