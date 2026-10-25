/** Small date helpers for the booking UI (all keys are "YYYY-MM-DD"). */

function pad(value) {
  return String(value).padStart(2, "0");
}

/** Today as a "YYYY-MM-DD" key in the browser's own time zone. */
export function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Shift a "YYYY-MM-DD" key by whole days. */
export function addDays(key, days) {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** The furthest date an employee may book, as a "YYYY-MM-DD" key. */
export function bookingHorizon(days) {
  return addDays(todayKey(), days);
}

/** Render "2026-05-02" as "Sat 2 May 2026". */
export function formatDayKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Office opening hours, mirrored from the API so the UI can offer valid slots. */
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 20;
export const SLOT_MINUTES = 30;

/** ["08:00", "08:30", … , "19:30"] — every valid start time. */
export const START_TIMES = buildTimes(OPEN_HOUR, CLOSE_HOUR - 0.5);
/** ["08:30", "09:00", … , "20:00"] — every valid end time. */
export const END_TIMES = buildTimes(OPEN_HOUR + 0.5, CLOSE_HOUR);

function buildTimes(fromHour, toHour) {
  const times = [];
  for (let minutes = fromHour * 60; minutes <= toHour * 60; minutes += SLOT_MINUTES) {
    times.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  }
  return times;
}

/** Duration label such as "1 h 30 m" for a from/to pair of "HH:mm" values. */
export function durationLabel(from, to) {
  const [fromHour, fromMinute] = from.split(":").map(Number);
  const [toHour, toMinute] = to.split(":").map(Number);
  const total = toHour * 60 + toMinute - (fromHour * 60 + fromMinute);
  if (total <= 0) return "—";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return [hours ? `${hours} h` : null, minutes ? `${minutes} m` : null].filter(Boolean).join(" ");
}

/** "HH:mm" as minutes since midnight. */
export function timeToMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * The current wall clock inside a given IANA time zone, so "now" is judged in
 * the office's own time rather than the visitor's. Falls back to the browser
 * zone when no (or an invalid) zone is supplied.
 */
export function nowInZone(timeZone) {
  const parts = {};
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    for (const { type, value } of formatter.formatToParts(new Date())) parts[type] = value;
  } catch {
    const now = new Date();
    return { dayKey: todayKey(), minutes: now.getHours() * 60 + now.getMinutes() };
  }
  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * The earliest start time that is still in the future for the given day.
 *
 * When the day is today the returned value is the next free 30-minute boundary
 * after the clock, so a visitor booking at 14:00 never sees 13:30 any more.
 * Returns `0` for any other day, which leaves every slot selectable.
 */
export function earliestStartMinutes(dayKey, timeZone) {
  const now = nowInZone(timeZone);
  if (dayKey !== now.dayKey) return 0;
  return (Math.floor(now.minutes / SLOT_MINUTES) + 1) * SLOT_MINUTES;
}
