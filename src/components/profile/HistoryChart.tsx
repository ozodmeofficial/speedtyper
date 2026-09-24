/** Server-rendered wpm history sparkline chart (last results, oldest → newest). */
export function HistoryChart({ points, height = 180 }: { points: { wpm: number; acc: number }[]; height?: number }) {
  const W = 1000;
  const padL = 36;
  const padR = 8;
  const padT = 10;
  const padB = 16;
  const n = points.length;
  if (n === 0) return null;
  const maxV = Math.max(10, ...points.map((p) => p.wpm));
  const yMax = Math.ceil((maxV * 1.1) / 10) * 10;
  const w = W - padL - padR;
  const h = height - padT - padB;
  const x = (i: number) => padL + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => padT + h - (v / yMax) * h;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.wpm).toFixed(1)}`).join("");
  // moving average (10)
  const avg = points.map((_, i) => {
    const from = Math.max(0, i - 9);
    const s = points.slice(from, i + 1);
    return s.reduce((a, b) => a + b.wpm, 0) / s.length;
  });
  const avgLine = avg.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ticks = [0, 0.5, 1].map((f) => Math.round(yMax * f));
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img" aria-label="wpm history">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--sub-alt)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={padL - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--sub)">
            {v}
          </text>
        </g>
      ))}
      <path d={line} fill="none" stroke="var(--sub)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={0.7} />
      <path d={avgLine} fill="none" stroke="var(--main)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.wpm)} r={2.5} fill="var(--sub)" opacity={0}>
          <title>{`${p.wpm.toFixed(2)} wpm · ${p.acc.toFixed(1)}%`}</title>
        </circle>
      ))}
    </svg>
  );
}
