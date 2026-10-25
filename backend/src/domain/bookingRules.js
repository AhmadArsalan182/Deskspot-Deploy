/**
 * Pure booking business rules.
 *
 * These functions contain no I/O so they can be unit tested directly and reused
 * by both the API and (via mirrored validation) the UI. The API is the source of
 * truth: every rule below is enforced server-side on every write.
 */

import {
  MAX_ACTIVE_DESK_BOOKINGS_PER_DAY,
  MAX_ADVANCE_DAYS,
  OFFICE_CLOSE_HOUR,
  OFFICE_OPEN_HOUR,
  SLOT_MINUTES,
} from "./constants.js";
import { addDaysToDayKey, getZonedParts, localDayKey } from "../lib/timezone.js";

/**
 * Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd).
 * Touching edges (A ends exactly when B starts) are NOT an overlap.
 */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** A slot boundary must land on a whole 30-minute mark in office-local time. */
export function isSlotAligned(date, timeZone) {
  const { second, minute } = getZonedParts(date, timeZone);
  return second === 0 && minute % SLOT_MINUTES === 0;
}

export function isValidInstant(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function minutesBetween(startUtc, endUtc) {
  return Math.round((endUtc.getTime() - startUtc.getTime()) / 60000);
}

/** True when the whole booking sits inside one office-local day within open hours. */
export function isWithinOfficeHours(startUtc, endUtc, timeZone) {
  const start = getZonedParts(startUtc, timeZone);
  const end = getZonedParts(endUtc, timeZone);
  const sameDay =
    start.year === end.year && start.month === end.month && start.day === end.day;
  if (!sameDay) return false;
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  return startMinutes >= OFFICE_OPEN_HOUR * 60 && endMinutes <= OFFICE_CLOSE_HOUR * 60;
}

function violation(code, message) {
  return { code, message };
}

/**
 * Evaluate every rule for a prospective booking and return all violations.
 * An empty array means the booking passes the business rules (overlap against
 * existing rows is checked separately, atomically, by the booking service).
 *
 * @returns {Array<{code: string, message: string}>}
 */
export function collectBookingViolations({
  space,
  timeZone,
  startUtc,
  endUtc,
  attendees,
  nowUtc = new Date(),
  activeDeskBookingsOnLocalDay = 0,
}) {
  const violations = [];

  if (!isValidInstant(startUtc) || !isValidInstant(endUtc)) {
    return [violation("INVALID_TIME", "Start and end times must be valid ISO-8601 instants.")];
  }

  if (endUtc.getTime() <= startUtc.getTime()) {
    violations.push(violation("INVALID_RANGE", "End time must be after start time."));
    return violations;
  }

  if (!isSlotAligned(startUtc, timeZone) || !isSlotAligned(endUtc, timeZone)) {
    violations.push(
      violation("SLOT_ALIGNMENT", `Bookings must start and end on ${SLOT_MINUTES}-minute boundaries.`),
    );
  }

  const duration = minutesBetween(startUtc, endUtc);
  if (duration % SLOT_MINUTES !== 0) {
    violations.push(
      violation("SLOT_ALIGNMENT", `Booking length must be a multiple of ${SLOT_MINUTES} minutes.`),
    );
  }

  if (!space.isActive) {
    violations.push(violation("SPACE_INACTIVE", "This space is deactivated and cannot be booked."));
  }

  if (!Number.isInteger(attendees) || attendees < 1) {
    violations.push(violation("ATTENDEES_INVALID", "Attendees must be a whole number of at least 1."));
  } else if (attendees > space.capacity) {
    violations.push(
      violation(
        "CAPACITY_EXCEEDED",
        `This space seats ${space.capacity}. Reduce the number of attendees to ${space.capacity} or fewer.`,
      ),
    );
  }

  if (!isWithinOfficeHours(startUtc, endUtc, timeZone)) {
    violations.push(
      violation(
        "OUTSIDE_OFFICE_HOURS",
        `Bookings must fit inside office hours (${String(OFFICE_OPEN_HOUR).padStart(2, "0")}:00–${String(OFFICE_CLOSE_HOUR).padStart(2, "0")}:00 local time).`,
      ),
    );
  }

  if (startUtc.getTime() <= nowUtc.getTime()) {
    violations.push(violation("IN_THE_PAST", "Bookings must start in the future."));
  }

  const today = localDayKey(nowUtc, timeZone);
  const latestDay = addDaysToDayKey(today, MAX_ADVANCE_DAYS);
  const bookingDay = localDayKey(startUtc, timeZone);
  if (bookingDay > latestDay) {
    violations.push(
      violation("ADVANCE_LIMIT", `Bookings can only be made up to ${MAX_ADVANCE_DAYS} days ahead.`),
    );
  }

  if (
    space.type === "DESK" &&
    activeDeskBookingsOnLocalDay >= MAX_ACTIVE_DESK_BOOKINGS_PER_DAY
  ) {
    violations.push(
      violation(
        "DESK_DAILY_LIMIT",
        `You can hold at most ${MAX_ACTIVE_DESK_BOOKINGS_PER_DAY} desk bookings per day.`,
      ),
    );
  }

  return violations;
}
