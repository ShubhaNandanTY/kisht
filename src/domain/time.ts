// All business dates are Indian Standard Time (UTC+5:30, no daylight saving), whatever the
// device or server timezone is. Dates are carried as "YYYY-MM-DD" strings.
export const IST_OFFSET_MIN = 330;
const DAY_MS = 86_400_000;

function shifted(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
}

export function istDate(d: Date): string {
  return shifted(d).toISOString().slice(0, 10);
}

/** Minutes since IST midnight. */
export function istMinutes(d: Date): number {
  const s = shifted(d);
  return s.getUTCHours() * 60 + s.getUTCMinutes();
}

/** The UTC instant for an IST wall-clock time on a given date. */
export function istInstant(dateStr: string, hours: number, minutes = 0): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hours, minutes) - IST_OFFSET_MIN * 60_000);
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
