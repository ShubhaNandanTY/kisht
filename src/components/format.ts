import type { Lang } from "@/i18n/dict";

const TZ = "Asia/Kolkata";
const locale = (l: Lang) => (l === "hi" ? "hi-IN" : "en-IN");

export function inr(n: number): string {
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

export function inrShort(n: number): string {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n >= 1_000_000 ? 1 : 2).replace(/\.?0+$/, "")} L`;
  return inr(n);
}

export function day(date: string, lang: Lang): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function weekdayDay(date: string, lang: Lang): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale(lang), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function time(iso: string | Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function dateTime(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

export function pct(x: number | null | undefined, digits = 1): string {
  return x === null || x === undefined ? "–" : `${(x * 100).toFixed(digits)}%`;
}
