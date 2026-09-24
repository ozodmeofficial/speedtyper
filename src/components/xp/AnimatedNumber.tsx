"use client";

import { useEffect, useRef } from "react";
import { easeOutCubic, prefersReducedMotion } from "@/lib/client/motion";

/**
 * Number that tweens to its new value by writing textContent from rAF
 * (no React re-render per frame). SSR/first paint shows `from` (or the value).
 */
export function AnimatedNumber({
  value,
  from,
  duration = 700,
  delay = 0,
  decimals = 0,
  suffix = "",
  animate = true,
  className,
  title,
}: {
  value: number;
  /** start value for the first animation (defaults to `value`, i.e. no intro) */
  from?: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  suffix?: string;
  animate?: boolean;
  className?: string;
  title?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(from ?? value);
  const fmt = (n: number) => `${n.toFixed(decimals)}${suffix}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = shown.current;
    const end = value;
    if (!animate || start === end || prefersReducedMotion()) {
      shown.current = end;
      el.textContent = fmt(end);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now + delay;
      const k = Math.max(0, Math.min(1, (now - t0) / duration));
      const v = start + (end - start) * easeOutCubic(k);
      shown.current = v;
      el.textContent = fmt(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animate, duration, delay, decimals, suffix]);

  return (
    <span ref={ref} className={className} title={title} suppressHydrationWarning>
      {fmt(from ?? value)}
    </span>
  );
}
