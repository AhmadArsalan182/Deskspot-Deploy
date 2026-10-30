/**
 * Booking write/read logic.
 *
 * Concurrency: `createBooking` performs the overlap check and the insert inside
 * a single transaction that first takes Postgres advisory locks on the acting
 * user (to serialise the per-day desk limit) and on the space (to serialise
 * overlap checks). The `bookings_no_overlap` exclusion constraint is the final
 * backstop. See docs/adr/0002-preventing-double-bookings.md.
 */

import prisma from "../lib/prisma.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { collectBookingViolations, isValidInstant, minutesBetween } from "../domain/bookingRules.js";
import { serializeBooking } from "../domain/serializers.js";
import { ROOM_BUFFER_MINUTES, SLOT_MINUTES } from "../domain/constants.js";
import {
  endOfLocalDayUtc,
  localDateTimeToUtc,
  localDayKey,
  startOfLocalDayUtc,
} from "../lib/timezone.js";
import { paginationMeta, parsePagination } from "../lib/pagination.js";
import { AppError } from "../lib/errors.js";
import { expandRecurringDates } from "../domain/recurringPattern.js";
import { publishAvailabilityChange } from "./availabilityHub.js";

/** Widen a room booking window by the turnaround buffer on both sides. */
function roomClashWindow(spaceType, startUtc, endUtc) {
  if (spaceType !== "ROOM" || ROOM_BUFFER_MINUTES <= 0) {
    return { clashStart: startUtc, clashEnd: endUtc };
  }
  const padMs = ROOM_BUFFER_MINUTES * 60 * 1000;
  return {
    clashStart: new Date(startUtc.getTime() - padMs),
    clashEnd: new Date(endUtc.getTime() + padMs),
  };
}

const bookingInclude = {
  space: { include: { office: true } },
  user: { select: { id: true, fullName: true, email: true } },
};

const LOCK_NAMESPACE = 0x0de5cc07; // arbitrary constant namespace for advisory locks

function isOverlapConstraintError(error) {
  const message = String(error?.message ?? "");
  return message.includes("bookings_no_overlap") || error?.code === "23P01";
}

/** Count the user's ACTIVE desk bookings on the same office-local day and office. */
async function countActiveDeskBookingsOnDay(client, { userId, officeId, dayStartUtc, dayEndUtc }) {
  return client.booking.count({
    where: {
      userId,
      status: "ACTIVE",
      space: { officeId, type: "DESK" },
      startUtc: { gte: dayStartUtc, lt: dayEndUtc },
    },
  });
}

async function notify(client, { userId, type, message }) {
  return client.notification.create({ data: { userId, type, message } });
}

export async function createBooking({ actor, spaceId, startUtc, endUtc, attendees = 1, nowUtc = new Date() }) {
  if (!isValidInstant(startUtc) || !isValidInstant(endUtc)) {
    throw badRequest("INVALID_TIME", "startUtc and endUtc must be valid ISO-8601 instants.");
  }

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    include: { office: true },
  });
  if (!space) throw notFound("Space not found.");

  const timeZone = space.office.timezone;
  const dayKey = localDayKey(startUtc, timeZone);
  const dayStartUtc = startOfLocalDayUtc(dayKey, timeZone);
  const dayEndUtc = endOfLocalDayUtc(dayKey, timeZone);

  try {
    const booking = await prisma.$transaction(async (tx) => {
      // Lock ordering is fixed (user, then space) to avoid deadlocks.
      // The casts pin both arguments to the (int4, int4) overload of the lock function.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, hashtext(${actor.id})::int)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, hashtext(${spaceId})::int)`;

      const activeDeskBookingsOnLocalDay = await countActiveDeskBookingsOnDay(tx, {
        userId: actor.id,
        officeId: space.officeId,
        dayStartUtc,
        dayEndUtc,
      });

      const violations = collectBookingViolations({
        space,
        timeZone,
        startUtc,
        endUtc,
        attendees,
        nowUtc,
        activeDeskBookingsOnLocalDay,
      });
      if (violations.length > 0) {
        throw badRequest(violations[0].code, violations[0].message, violations);
      }

      const { clashStart, clashEnd } = roomClashWindow(space.type, startUtc, endUtc);
      const clash = await tx.booking.findFirst({
        where: {
          spaceId,
          status: "ACTIVE",
          startUtc: { lt: clashEnd },
          endUtc: { gt: clashStart },
        },
        select: { id: true },
      });
      if (clash) {
        throw conflict(
          "BOOKING_CONFLICT",
          space.type === "ROOM"
            ? `This room needs a ${ROOM_BUFFER_MINUTES}-minute gap between bookings.`
            : "This space is already booked for part of that time.",
        );
      }

      const created = await tx.booking.create({
        data: { spaceId, userId: actor.id, startUtc, endUtc, attendees },
        include: bookingInclude,
      });

      await notify(tx, {
        userId: actor.id,
        type: "BOOKING_CONFIRMED",
        message: `Your booking for ${space.name} on ${dayKey} ${serializeBooking(created).localStartTime} was confirmed.`,
      });

      return created;
    });

    publishAvailabilityChange(space.officeId, dayKey, "booking.created");
    return serializeBooking(booking);
  } catch (error) {
    if (isOverlapConstraintError(error)) {
      throw conflict("BOOKING_CONFLICT", "This space is already booked for part of that time.");
    }
    throw error;
  }
}

export async function cancelBooking({ actor, bookingId, reason, nowUtc = new Date() }) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude,
  });
  if (!booking) throw notFound("Booking not found.");

  const isAdmin = actor.role === "ADMIN";
  // Hide the existence of other people's bookings from employees (no IDOR).
  if (!isAdmin && booking.userId !== actor.id) throw notFound("Booking not found.");

  if (booking.status === "CANCELLED") {
    throw conflict("ALREADY_CANCELLED", "This booking is already cancelled.");
  }

  if (booking.startUtc.getTime() <= nowUtc.getTime()) {
    throw badRequest("BOOKING_ALREADY_STARTED", "Bookings that have already started cannot be cancelled.");
  }

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (isAdmin && trimmedReason.length < 3) {
    throw badRequest("CANCEL_REASON_REQUIRED", "Admins must provide a reason when cancelling a booking.");
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        cancelReason: trimmedReason || null,
        cancelledById: actor.id,
        cancelledAt: nowUtc,
      },
      include: bookingInclude,
    });

    const when = `${updated.startUtc.toISOString()}`;
    await notify(tx, {
      userId: updated.userId,
      type: isAdmin && updated.userId !== actor.id ? "BOOKING_CANCELLED_BY_ADMIN" : "BOOKING_CANCELLED",
      message: isAdmin && updated.userId !== actor.id
        ? `Your booking for ${updated.space.name} (${when}) was cancelled by an administrator: ${trimmedReason}`
        : `Your booking for ${updated.space.name} (${when}) was cancelled.`,
    });

    return updated;
  });

  const officeId = cancelled.space.officeId;
  const dayKey = localDayKey(cancelled.startUtc, cancelled.space.office.timezone);
  publishAvailabilityChange(officeId, dayKey, "booking.cancelled");
  return serializeBooking(cancelled);
}

/**
 * Create one booking per expanded date. Partial failures are reported per date
 * rather than rolling the whole series back.
 */
export async function createRecurringBookings({
  actor,
  spaceId,
  from,
  to,
  attendees = 1,
  startDate,
  endDate,
  count,
  weekdays,
  nowUtc = new Date(),
}) {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    include: { office: true },
  });
  if (!space) throw notFound("Space not found.");

  const dates = expandRecurringDates({
    startDate,
    endDate,
    count,
    weekdays,
    timeZone: space.office.timezone,
    nowUtc,
  });
  if (dates.length === 0) {
    throw badRequest(
      "EMPTY_SERIES",
      "No dates matched that recurrence within the 14-day booking horizon.",
    );
  }

  const results = [];
  for (const date of dates) {
    const startUtc = localDateTimeToUtc(date, from, space.office.timezone);
    const endUtc = localDateTimeToUtc(date, to, space.office.timezone);
    if (!startUtc || !endUtc) {
      results.push({
        date,
        ok: false,
        error: { code: "INVALID_DATE", message: "Could not resolve that local date and time." },
      });
      continue;
    }
    try {
      const booking = await createBooking({
        actor,
        spaceId,
        startUtc,
        endUtc,
        attendees,
        nowUtc,
      });
      results.push({ date, ok: true, booking });
    } catch (error) {
      if (error instanceof AppError) {
        results.push({
          date,
          ok: false,
          error: { code: error.code, message: error.message },
        });
      } else {
        throw error;
      }
    }
  }

  return {
    spaceId,
    from,
    to,
    requested: dates.length,
    created: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  };
}

export async function listMyBookings({ actor, scope = "all", page, pageSize }) {
  const now = new Date();
  const where = { userId: actor.id };
  if (scope === "upcoming") {
    where.status = "ACTIVE";
    where.endUtc = { gt: now };
  } else if (scope === "past") {
    where.OR = [{ endUtc: { lte: now } }, { status: "CANCELLED" }];
  }

  const orderBy = scope === "upcoming" ? { startUtc: "asc" } : { startUtc: "desc" };

  const [total, rows] = await prisma.$transaction([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: rows.map(serializeBooking),
    pagination: paginationMeta({ total, page, pageSize }),
  };
}

export async function listBookingsForAdmin({ officeId, date, status, page, pageSize }) {
  const where = {};
  if (officeId) where.space = { officeId };
  if (status) where.status = status;
  if (date) {
    const office = officeId
      ? await prisma.office.findUnique({ where: { id: officeId } })
      : null;
    const timeZone = office?.timezone ?? "UTC";
    where.startUtc = { gte: startOfLocalDayUtc(date, timeZone), lt: endOfLocalDayUtc(date, timeZone) };
  }

  const [total, rows] = await prisma.$transaction([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { startUtc: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items: rows.map(serializeBooking), pagination: paginationMeta({ total, page, pageSize }) };
}

export { parsePagination };

/** Booked slot count (30-minute units) for a list of bookings. */
export function countSlotsFor(bookings) {
  return bookings.reduce((total, booking) => total + minutesBetween(booking.startUtc, booking.endUtc) / SLOT_MINUTES, 0);
}
