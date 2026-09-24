/**
 * Deterministic formatting (identical on server and client — no Intl/locale
 * or local-timezone dependence, so no hydration mismatches). Dates are shown
 * in Asia/Tashkent (UTC+5, no DST).
 */
export const TASHKENT_OFFSET_MS = 5 * 3600 * 1000;

function tashkentParts(d: Date | number | string) {
  const t = new Date(typeof d === "object" ? d.getTime() : d).getTime() + TASHKENT_OFFSET_MS;
  const x = new Date(t);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), min: x.getUTCMinutes(), wd: (x.getUTCDay() + 6) % 7 };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYYMMDD of the Tashkent calendar day */
export function dayKey(d: Date | number = Date.now()): number {
  const p = tashkentParts(d);
  return p.y * 10000 + (p.m + 1) * 100 + p.d;
}

export function dayKeyToUtcMidnight(key: number): number {
  const y = Math.floor(key / 10000);
  const m = Math.floor((key % 10000) / 100) - 1;
  const d = key % 100;
  return Date.UTC(y, m, d) - TASHKENT_OFFSET_MS;
}

export function formatDate(d: Date | number | string, monthsCsv: string): string {
  const p = tashkentParts(d);
  const months = monthsCsv.split(",");
  return `${p.d} ${months[p.m] ?? p.m + 1} ${p.y}`;
}

export function formatDateTime(d: Date | number | string, monthsCsv: string): string {
  const p = tashkentParts(d);
  return `${formatDate(d, monthsCsv)}, ${pad(p.h)}:${pad(p.min)}`;
}

export function formatDayKey(key: number, monthsCsv: string): string {
  return formatDate(dayKeyToUtcMidnight(key) + 12 * 3600 * 1000, monthsCsv);
}

/** hh:mm:ss */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function fmt(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(decimals);
}

export function fmtInt(n: number): string {
  const s = Math.round(n).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** "1 soat 5 daq" / "3 daq 12 s" / "15 s" using the dictionary units */
export function formatDurationShort(totalSeconds: number, units: { h: string; m: string; s: string }): string {
  const t = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const u = (tpl: string, n: number) => tpl.replace("{n}", String(n));
  if (h > 0) return `${u(units.h, h)} ${u(units.m, m)}`;
  if (m > 0) return `${u(units.m, m)} ${u(units.s, s)}`;
  return u(units.s, s);
}
