"use client";

/** True when the OS asks for reduced motion (always false during SSR). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * Lightweight confetti burst on a throw-away canvas (≤ 1 s, ~90 particles).
 * Only transform-free canvas drawing; the canvas is removed afterwards.
 */
export function confetti(opts: { x?: number; y?: number; count?: number; duration?: number } = {}) {
  if (typeof document === "undefined" || prefersReducedMotion()) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = `position:fixed;inset:0;width:${w}px;height:${h}px;pointer-events:none;z-index:60`;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const colors = ["--main", "--caret", "--text", "--sub"].map((v) => css.getPropertyValue(v).trim() || "#e2b714");
  const ox = opts.x ?? w / 2;
  const oy = opts.y ?? h * 0.38;
  const n = opts.count ?? 90;
  const duration = opts.duration ?? 950;
  const parts = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const v = 5 + Math.random() * 7;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 2,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      s: 4 + Math.random() * 5,
      c: colors[i % colors.length],
    };
  });
  const t0 = performance.now();
  const frame = (now: number) => {
    const t = (now - t0) / duration;
    ctx.clearRect(0, 0, w, h);
    if (t >= 1) {
      canvas.remove();
      return;
    }
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
