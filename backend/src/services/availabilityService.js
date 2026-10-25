/** Free-space search: returns spaces with no overlapping ACTIVE booking. */

import prisma from "../lib/prisma.js";
import { badRequest, notFound } from "../lib/errors.js";
import { serializeSpace } from "../domain/serializers.js";
import {
  endOfLocalDayUtc,
  formatLocalTime,
  isValidTimeZone,
  localDateTimeToUtc,
  startOfLocalDayUtc,
} from "../lib/timezone.js";
import { isSlotAligned, isWithinOfficeHours } from "../domain/bookingRules.js";

function normalizeTime(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const match = /^(\d{2}):(\d{2})$/.exec(String(value));
  if (!match) throw badRequest("INVALID_TIME_FORMAT", "Times must be passed as HH:mm.");
  return `${match[1]}:${match[2]}`;
}

export async function findAvailableSpaces({ officeId, date, from, to, type, includeBookingIds = false }) {
  if (!officeId) throw badRequest("OFFICE_REQUIRED", "officeId is required.");
  if (!date) throw badRequest("DATE_REQUIRED", "date is required (YYYY-MM-DD).");

  const office = await prisma.office.findUnique({ where: { id: officeId } });
  if (!office) throw notFound("Office not found.");
  if (!isValidTimeZone(office.timezone)) {
    throw badRequest("INVALID_TIMEZONE", `Office has an invalid time zone: ${office.timezone}`);
  }

  const fromTime = normalizeTime(from, "08:00");
  const toTime = normalizeTime(to, "20:00");

  const startUtc = localDateTimeToUtc(date, fromTime, office.timezone);
  const endUtc = localDateTimeToUtc(date, toTime, office.timezone);
  if (!startUtc || !endUtc) throw badRequest("INVALID_DATE", "date must be a valid YYYY-MM-DD value.");
  if (endUtc.getTime() <= startUtc.getTime()) {
    throw badRequest("INVALID_RANGE", "The end time must be after the start time.");
  }
  if (!isSlotAligned(startUtc, office.timezone) || !isSlotAligned(endUtc, office.timezone)) {
    throw badRequest("SLOT_ALIGNMENT", "Times must fall on 30-minute boundaries.");
  }
  if (!isWithinOfficeHours(startUtc, endUtc, office.timezone)) {
    throw badRequest("OUTSIDE_OFFICE_HOURS", "The requested window is outside office hours (08:00–20:00 local).");
  }

  const spaces = await prisma.space.findMany({
    where: { officeId, isActive: true, ...(type ? { type } : {}) },
    include: { office: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  const dayStartUtc = startOfLocalDayUtc(date, office.timezone);
  const dayEndUtc = endOfLocalDayUtc(date, office.timezone);

  const dayBookings = spaces.length
    ? await prisma.booking.findMany({
        where: {
          status: "ACTIVE",
          spaceId: { in: spaces.map((space) => space.id) },
          startUtc: { lt: dayEndUtc },
          endUtc: { gt: dayStartUtc },
        },
        orderBy: { startUtc: "asc" },
      })
    : [];

  const bySpace = new Map();
  for (const booking of dayBookings) {
    const list = bySpace.get(booking.spaceId) ?? [];
    list.push({
      // Booking ids belong to the employee who made them. Only admins, who can
      // act on any booking, receive them; everyone else just sees the window.
      ...(includeBookingIds ? { id: booking.id } : {}),
      startUtc: booking.startUtc.toISOString(),
      endUtc: booking.endUtc.toISOString(),
      localStartTime: formatLocalTime(booking.startUtc, office.timezone),
      localEndTime: formatLocalTime(booking.endUtc, office.timezone),
    });
    bySpace.set(booking.spaceId, list);
  }

  const results = spaces.map((space) => {
    const busy = bySpace.get(space.id) ?? [];
    const isFreeForWindow = !busy.some(
      (slot) =>
        new Date(slot.startUtc).getTime() < endUtc.getTime() &&
        startUtc.getTime() < new Date(slot.endUtc).getTime(),
    );
    return { ...serializeSpace(space), available: isFreeForWindow, busy };
  });

  return {
    office: { id: office.id, name: office.name, city: office.city, timezone: office.timezone },
    date,
    from: fromTime,
    to: toTime,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    spaces: results,
  };
}
