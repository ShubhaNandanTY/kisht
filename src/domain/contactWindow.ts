import { istDate, istInstant, istMinutes, addDays } from "./time";

// RBI's recovery guidelines allow borrower contact only between 8 am and 7 pm.
export const WINDOW_START_MIN = 8 * 60;
export const WINDOW_END_MIN = 19 * 60; // exclusive: 7:00 pm itself is outside

export type WindowCheck =
  | { allowed: true; closesAt: Date; minutesLeft: number }
  | { allowed: false; reason: "before_8am" | "after_7pm"; opensAt: Date };

export function checkContactWindow(at: Date): WindowCheck {
  const mins = istMinutes(at);
  const today = istDate(at);
  if (mins < WINDOW_START_MIN) {
    return { allowed: false, reason: "before_8am", opensAt: istInstant(today, 8) };
  }
  if (mins >= WINDOW_END_MIN) {
    return { allowed: false, reason: "after_7pm", opensAt: istInstant(addDays(today, 1), 8) };
  }
  return { allowed: true, closesAt: istInstant(today, 19), minutesLeft: WINDOW_END_MIN - mins };
}

export function isWithinContactWindow(at: Date): boolean {
  return checkContactWindow(at).allowed;
}

export type TimestampCheck = { ok: true; flags: string[] } | { ok: false; reason: string; flags: string[] };

const MAX_FUTURE_SKEW_MS = 10 * 60_000;
const MAX_AGE_MS = 7 * 86_400_000;

/**
 * Checks a contact time reported by a phone (possibly logged offline hours ago).
 * The server cannot trust the device clock, so it rejects times in the future,
 * rejects contacts outside 8 am to 7 pm, and flags very late or late-entered records
 * for the manager instead of silently accepting them.
 */
export function checkReportedContactTime(occurredAt: Date, capturedAt: Date, receivedAt: Date): TimestampCheck {
  const flags: string[] = [];
  if (occurredAt.getTime() - receivedAt.getTime() > MAX_FUTURE_SKEW_MS || capturedAt.getTime() - receivedAt.getTime() > MAX_FUTURE_SKEW_MS) {
    return { ok: false, reason: "clock_in_future", flags: ["device_clock_suspect"] };
  }
  if (occurredAt.getTime() > capturedAt.getTime() + MAX_FUTURE_SKEW_MS) {
    return { ok: false, reason: "occurred_after_capture", flags };
  }
  if (receivedAt.getTime() - occurredAt.getTime() > MAX_AGE_MS) {
    return { ok: false, reason: "too_old", flags };
  }
  if (!isWithinContactWindow(occurredAt)) {
    return { ok: false, reason: "outside_contact_hours", flags };
  }
  if (capturedAt.getTime() - occurredAt.getTime() > 60 * 60_000) flags.push("late_entry");
  if (istDate(capturedAt) !== istDate(occurredAt)) flags.push("logged_next_day");
  if (receivedAt.getTime() - capturedAt.getTime() > 60 * 60_000) flags.push("synced_late");
  return { ok: true, flags };
}
