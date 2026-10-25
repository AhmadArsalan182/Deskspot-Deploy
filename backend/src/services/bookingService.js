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
import { SLOT_MINUTES } from "../domain/constants.js";
import {
  endOfLocalDayUtc,
  localDayKey,
  startOfLocalDayUtc,
} from "../lib/timezone.js";
import { paginationMeta, parsePagination } from "../lib/pagination.js";

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

      const clash = await tx.booking.findFirst({
        where: {
          spaceId,
          status: "ACTIVE",
          startUtc: { lt: endUtc },
          endUtc: { gt: startUtc },
        },
        select: { id: true },
      });
      if (clash) {
        throw conflict("BOOKING_CONFLICT", "This space is already booked for part of that time.");
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

  return serializeBooking(cancelled);
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
