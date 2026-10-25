/**
 * Minimal, dependency-free IANA time-zone helpers built on Intl.
 *
 * DeskSpot stores every booking as an absolute UTC instant. These helpers
 * translate between those instants and the office-local wall clock, which is
 * what employees and admins actually see.
 *
 * See docs/adr/0003-time-and-time-zone-handling.md for the reasoning.
 */

const FORMATTERS = new Map();

function formatterFor(timeZone) {
  let formatter = FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Break an instant down into the wall-clock parts for a given time zone. */
export function getZonedParts(date, timeZone) {
  const parts = formatterFor(timeZone).formatToParts(date);
  const map = {};
  for (const { type, value } of parts) map[type] = value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Offset of the zone at an instant, in milliseconds (local - UTC). */
function zoneOffsetMs(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/**
 * Convert office-local wall-clock parts into the corresponding UTC instant.
 * The offset is resolved twice so DST transitions resolve to a stable instant.
 */
export function zonedTimeToUtc(parts, timeZone) {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = parts;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = zoneOffsetMs(new Date(utcGuess), timeZone);
  let timestamp = utcGuess - offset;
  offset = zoneOffsetMs(new Date(timestamp), timeZone);
  timestamp = utcGuess - offset;
  return new Date(timestamp);
}

/** Office-local calendar day for an instant, as "YYYY-MM-DD". */
export function localDayKey(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Parse "YYYY-MM-DD" into numeric parts, or null when malformed. */
export function parseDayKey(dayKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey ?? ""));
  if (!match) return null;
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

/** UTC instant for 00:00 office-local on the given local day. */
export function startOfLocalDayUtc(dayKey, timeZone) {
  const parts = parseDayKey(dayKey);
  if (!parts) return null;
  return zonedTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0 }, timeZone);
}

/** UTC instant for the end (exclusive) of the given office-local day. */
export function endOfLocalDayUtc(dayKey, timeZone) {
  const parts = parseDayKey(dayKey);
  if (!parts) return null;
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return zonedTimeToUtc(
    { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0 },
    timeZone,
  );
}

/** Build a UTC instant from a local day key plus "HH:mm". */
export function localDateTimeToUtc(dayKey, time, timeZone) {
  const parts = parseDayKey(dayKey);
  const match = /^(\d{2}):(\d{2})$/.exec(String(time ?? ""));
  if (!parts || !match) return null;
  return zonedTimeToUtc(
    { ...parts, hour: Number(match[1]), minute: Number(match[2]), second: 0 },
    timeZone,
  );
}

/** Format an instant as office-local "HH:mm". */
export function formatLocalTime(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Format an instant as office-local "YYYY-MM-DD HH:mm". */
export function formatLocalDateTime(date, timeZone) {
  return `${localDayKey(date, timeZone)} ${formatLocalTime(date, timeZone)}`;
}

/** Add whole days to a local day key. */
export function addDaysToDayKey(dayKey, days) {
  const parts = parseDayKey(dayKey);
  if (!parts) return null;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}
