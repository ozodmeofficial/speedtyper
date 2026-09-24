import { dayKey, dayKeyToUtcMidnight, formatDayKey } from "@/lib/format";

const CELL = 14;
const GAP = 4;

/** Server-rendered activity heatmap for the last 365 days (Asia/Tashkent days). */
export function Heatmap({
  counts,
  months,
  weekdays,
  label,
  less,
  more,
}: {
  counts: Map<number, number>;
  months: string;
  weekdays: string;
  label: (date: string, n: number) => string;
  less: string;
  more: string;
}) {
  const today = dayKey();
  const todayMs = dayKeyToUtcMidnight(today) + 12 * 3600_000;
  const todayWd = (new Date(todayMs + 5 * 3600_000).getUTCDay() + 6) % 7; // 0 = monday
  const weeks = 53;
  const start = todayMs - ((weeks - 1) * 7 + todayWd) * 86400_000;
  const max = Math.max(1, ...counts.values());
  const monthNames = months.split(",");
  const wd = weekdays.split(",");

  const cells: React.ReactNode[] = [];
  const monthLabels: React.ReactNode[] = [];
  let lastMonth = -1;
  let lastLabelWeek = -10;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const ms = start + (w * 7 + d) * 86400_000;
      const key = dayKey(ms);
      if (key > today) continue;
      const n = counts.get(key) ?? 0;
      const level = n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4));
      const x = 28 + w * (CELL + GAP);
      const y = 18 + d * (CELL + GAP);
      if (d === 0) {
        const m = Math.floor((key % 10000) / 100) - 1;
        if (m !== lastMonth && w === 0) lastMonth = m;
        else if (m !== lastMonth && w < weeks - 1 && w - lastLabelWeek >= 3) {
          lastMonth = m;
          lastLabelWeek = w;
          monthLabels.push(
            <text key={`m${w}`} x={x} y={10} fontSize={10} fill="var(--sub)">
              {monthNames[m]}
            </text>,
          );
        }
      }
      cells.push(
        <rect
          key={key}
          x={x}
          y={y}
          width={CELL}
          height={CELL}
          rx={2.5}
          fill={level === 0 ? "var(--bg)" : "var(--main)"}
          fillOpacity={level === 0 ? 1 : [0, 0.3, 0.55, 0.8, 1][level]}
        >
          <title>{label(formatDayKey(key, months), n)}</title>
        </rect>,
      );
    }
  }
  const width = 28 + weeks * (CELL + GAP);
  const height = 18 + 7 * (CELL + GAP) + 22;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" style={{ minWidth: 720 }} role="img" aria-label="activity">
        {monthLabels}
        {[0, 2, 4].map((d) => (
          <text key={d} x={0} y={18 + d * (CELL + GAP) + CELL - 2} fontSize={10} fill="var(--sub)">
            {wd[d]}
          </text>
        ))}
        {cells}
        <g transform={`translate(${width - 5 * (CELL + GAP) - 60}, ${height - 12})`}>
          <text x={-6} y={9} fontSize={10} fill="var(--sub)" textAnchor="end">
            {less}
          </text>
          {[0, 1, 2, 3, 4].map((l) => (
            <rect key={l} x={l * (CELL + GAP)} y={0} width={CELL} height={CELL} rx={2.5} fill={l === 0 ? "var(--bg)" : "var(--main)"} fillOpacity={l === 0 ? 1 : [0, 0.3, 0.55, 0.8, 1][l]} />
          ))}
          <text x={5 * (CELL + GAP) + 4} y={9} fontSize={10} fill="var(--sub)">
            {more}
          </text>
        </g>
      </svg>
    </div>
  );
}
