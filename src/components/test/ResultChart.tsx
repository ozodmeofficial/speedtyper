"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/components/providers/I18nProvider";

interface Props {
  wpm: number[];
  raw: number[];
  errors: number[];
  height?: number;
}

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const step = v > 200 ? 50 : v > 100 ? 25 : v > 40 ? 20 : 10;
  return Math.ceil((v * 1.05) / step) * step;
}

/** Lightweight SVG line chart: wpm + raw per second, error markers on a secondary axis. */
export function ResultChart({ wpm, raw, errors, height = 200 }: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = wpm.length;
  const padL = 40;
  const padR = 34;
  const padT = 10;
  const padB = 24;
  const w = Math.max(0, width - padL - padR);
  const h = height - padT - padB;
  const yMax = niceMax(Math.max(1, ...wpm, ...raw));
  const eMax = Math.max(1, ...errors);

  const x = (i: number) => padL + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => padT + h - (v / yMax) * h;
  const ye = (v: number) => padT + h - (v / (eMax * 1.25)) * h;

  const path = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = useMemo(() => {
    if (n < 2 || w <= 0) return "";
    return `${wpm.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")}L${x(n - 1)},${padT + h}L${x(0)},${padT + h}Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wpm, w, h, yMax]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));
  const xStep = n > 60 ? 10 : n > 30 ? 5 : n > 12 ? 2 : 1;
  const xTicks: number[] = [];
  for (let i = 0; i < n; i += xStep) xTicks.push(i);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round(((px - padL) / w) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && n > 0 ? (
        <svg width={width} height={height} className="block" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="wpm chart">
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={padL + w} y1={y(v)} y2={y(v)} stroke="var(--sub-alt)" strokeWidth={1} />
              <text x={padL - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--sub)">
                {v}
              </text>
            </g>
          ))}
          {[0, Math.ceil(eMax * 1.25 * 0.5), Math.ceil(eMax * 1.25)].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
            <text key={`e${v}`} x={padL + w + 8} y={ye(v)} dy="0.32em" fontSize={11} fill="var(--sub)">
              {v}
            </text>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--sub)">
              {i + 1}
            </text>
          ))}
          <text x={10} y={padT + h / 2} fontSize={11} fill="var(--sub)" transform={`rotate(-90 10 ${padT + h / 2})`} textAnchor="middle">
            {t("result.chartWpm")}
          </text>
          {area ? <path d={area} fill="var(--main)" opacity={0.08} /> : null}
          <path d={path(raw)} fill="none" stroke="var(--sub)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
          <path d={path(wpm)} fill="none" stroke="var(--main)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
          {errors.map((e, i) =>
            e > 0 ? (
              <g key={`x${i}`} stroke="var(--error)" strokeWidth={2} strokeLinecap="round">
                <line x1={x(i) - 3.5} y1={ye(e) - 3.5} x2={x(i) + 3.5} y2={ye(e) + 3.5} />
                <line x1={x(i) - 3.5} y1={ye(e) + 3.5} x2={x(i) + 3.5} y2={ye(e) - 3.5} />
              </g>
            ) : null,
          )}
          {hover !== null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + h} stroke="var(--sub)" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(wpm[hover])} r={4} fill="var(--main)" />
              <circle cx={x(hover)} cy={y(raw[hover])} r={3} fill="var(--sub)" />
            </g>
          ) : null}
        </svg>
      ) : null}
      {hover !== null && width > 0 ? (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg bg-[var(--surface-solid)] px-3 py-2 text-xs shadow-lg ring-1 ring-[var(--border-strong)] tabular"
          style={{ left: Math.min(Math.max(x(hover) + 12, 0), width - 130) }}
        >
          <div className="mb-1 text-sub">{hover + 1}s</div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-main" /> {t("result.chartWpm")}: <b className="font-medium">{Math.round(wpm[hover])}</b>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sub" /> {t("result.chartRaw")}: <b className="font-medium">{Math.round(raw[hover])}</b>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-error" /> {t("result.chartErrors")}: <b className="font-medium">{errors[hover]}</b>
          </div>
        </div>
      ) : null}
    </div>
  );
}
