// Demo clock: lets a reviewer see the 8 am to 7 pm block at any hour. Only honoured when
// DEMO_MODE=true; production always uses the real time.
export const CLOCK_COOKIE = "kisht_clock_offset";

export function parseOffset(v: string | undefined | null): number {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= 24 * 60 ? Math.round(n) : 0;
}

export function clientNow(): Date {
  if (typeof document === "undefined") return new Date();
  const m = document.cookie.match(new RegExp(`(?:^|; )${CLOCK_COOKIE}=([^;]*)`));
  return new Date(Date.now() + parseOffset(m?.[1]) * 60_000);
}
