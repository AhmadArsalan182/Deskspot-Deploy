/**
 * Turn database rows into API payloads.
 *
 * Bookings always carry both the unambiguous UTC instants and the office-local
 * wall clock so clients never have to do time-zone maths themselves.
 */

import { formatLocalDateTime, formatLocalTime, localDayKey } from "../lib/timezone.js";

export function serializeOffice(office) {
  if (!office) return null;
  return {
    id: office.id,
    name: office.name,
    city: office.city,
    timezone: office.timezone,
    spaceCount: office._count?.spaces ?? undefined,
  };
}

export function serializeSpace(space) {
  if (!space) return null;
  return {
    id: space.id,
    name: space.name,
    type: space.type,
    capacity: space.capacity,
    isActive: space.isActive,
    officeId: space.officeId,
    office: space.office
      ? { id: space.office.id, name: space.office.name, city: space.office.city, timezone: space.office.timezone }
      : undefined,
  };
}

export function serializeBooking(booking) {
  if (!booking) return null;
  const timeZone = booking.space?.office?.timezone ?? "UTC";
  return {
    id: booking.id,
    status: booking.status,
    attendees: booking.attendees,
    startUtc: booking.startUtc.toISOString(),
    endUtc: booking.endUtc.toISOString(),
    date: localDayKey(booking.startUtc, timeZone),
    localStartTime: formatLocalTime(booking.startUtc, timeZone),
    localEndTime: formatLocalTime(booking.endUtc, timeZone),
    localStart: formatLocalDateTime(booking.startUtc, timeZone),
    localEnd: formatLocalDateTime(booking.endUtc, timeZone),
    space: booking.space
      ? { id: booking.space.id, name: booking.space.name, type: booking.space.type, capacity: booking.space.capacity }
      : undefined,
    office: booking.space?.office
      ? {
          id: booking.space.office.id,
          name: booking.space.office.name,
          city: booking.space.office.city,
          timezone: booking.space.office.timezone,
        }
      : undefined,
    user: booking.user
      ? { id: booking.user.id, fullName: booking.user.fullName, email: booking.user.email }
      : undefined,
    cancelReason: booking.cancelReason,
    cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
    createdAt: booking.createdAt.toISOString(),
  };
}

export function serializeNotification(notification) {
  return {
    id: notification.id,
    type: notification.type,
    message: notification.message,
    read: Boolean(notification.readAt),
    createdAt: notification.createdAt.toISOString(),
  };
}
