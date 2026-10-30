/**
 * Expand a weekday recurrence into office-local calendar dates.
 * Pure: no I/O. Weekdays use ISO numbering (1 = Monday … 7 = Sunday).
 */

import { MAX_ADVANCE_DAYS } from "./constants.js";
import { addDaysToDayKey, getZonedParts, localDayKey, parseDayKey } from "../lib/timezone.js";

/** JS Date.getUTCDay() Sunday=0 → ISO weekday. */
function isoWeekdayFromUtcParts(year, month, day) {
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

/**
 * @param {{ startDate: string, endDate?: string, count?: number, weekdays: number[], timeZone: string, nowUtc?: Date }} input
 * @returns {string[]} day keys in ascending order
 */
export function expandRecurringDates({
  startDate,
  endDate,
  count,
  weekdays,
  timeZone,
  nowUtc = new Date(),
}) {
  if (!parseDayKey(startDate)) return [];
  const wanted = new Set(weekdays);
  const today = localDayKey(nowUtc, timeZone);
  const latestAllowed = addDaysToDayKey(today, MAX_ADVANCE_DAYS);
  const hardEnd = endDate && endDate < latestAllowed ? endDate : latestAllowed;
  const maxDates = Math.min(count ?? MAX_ADVANCE_DAYS, MAX_ADVANCE_DAYS);

  const dates = [];
  let cursor = startDate < today ? today : startDate;
  // Walk at most MAX_ADVANCE_DAYS + 1 calendar days from the first candidate.
  for (let i = 0; i < MAX_ADVANCE_DAYS + 2 && dates.length < maxDates; i += 1) {
    if (cursor > hardEnd) break;
    const parts = parseDayKey(cursor);
    if (!parts) break;
    const weekday = isoWeekdayFromUtcParts(parts.year, parts.month, parts.day);
    if (wanted.has(weekday) && cursor >= startDate && cursor <= hardEnd) {
      dates.push(cursor);
    }
    cursor = addDaysToDayKey(cursor, 1);
    if (!cursor) break;
  }

  return dates;
}

/** ISO weekday (1–7) of an office-local day key. */
export function weekdayOfDayKey(dayKey) {
  const parts = parseDayKey(dayKey);
  if (!parts) return null;
  return isoWeekdayFromUtcParts(parts.year, parts.month, parts.day);
}

/** Exported for tests that need zoned weekday of an instant. */
export function weekdayOfInstant(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return isoWeekdayFromUtcParts(p.year, p.month, p.day);
}
