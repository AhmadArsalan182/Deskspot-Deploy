/** Admin insights: per-day occupancy and rolling usage statistics. */

import prisma from "../lib/prisma.js";
import { badRequest, notFound } from "../lib/errors.js";
import { serializeBooking } from "../domain/serializers.js";
import { minutesBetween } from "../domain/bookingRules.js";
import { OFFICE_CLOSE_HOUR, OFFICE_OPEN_HOUR, SLOT_MINUTES } from "../domain/constants.js";
import {
  addDaysToDayKey,
  endOfLocalDayUtc,
  localDayKey,
  startOfLocalDayUtc,
} from "../lib/timezone.js";

const SLOTS_PER_DAY = ((OFFICE_CLOSE_HOUR - OFFICE_OPEN_HOUR) * 60) / SLOT_MINUTES;

function occupancyPercent(bookedSlots, capacitySlots) {
  if (capacitySlots <= 0) return 0;
  return Math.round((bookedSlots / capacitySlots) * 1000) / 10;
}

function bookedSlots(bookings) {
  return bookings.reduce(
    (total, booking) => total + minutesBetween(booking.startUtc, booking.endUtc) / SLOT_MINUTES,
    0,
  );
}

const bookingInclude = {
  space: { include: { office: true } },
  user: { select: { id: true, fullName: true, email: true } },
};

/** Day view for one office: every space with its bookings for the selected date. */
export async function getDailyOccupancy({ officeId, date, nowUtc = new Date() }) {
  if (!officeId) throw badRequest("OFFICE_REQUIRED", "officeId is required.");
  const dayKey = date || localDayKey(nowUtc, "UTC");

  const office = await prisma.office.findUnique({ where: { id: officeId } });
  if (!office) throw notFound("Office not found.");

  const dayStartUtc = startOfLocalDayUtc(dayKey, office.timezone);
  const dayEndUtc = endOfLocalDayUtc(dayKey, office.timezone);
  if (!dayStartUtc || !dayEndUtc) throw badRequest("INVALID_DATE", "date must be a valid YYYY-MM-DD value.");

  const spaces = await prisma.space.findMany({
    where: { officeId },
    orderBy: [{ isActive: "desc" }, { type: "asc" }, { name: "asc" }],
  });

  const bookings = await prisma.booking.findMany({
    where: {
      status: "ACTIVE",
      space: { officeId },
      startUtc: { lt: dayEndUtc },
      endUtc: { gt: dayStartUtc },
    },
    include: bookingInclude,
    orderBy: { startUtc: "asc" },
  });

  const bySpace = new Map();
  for (const booking of bookings) {
    const list = bySpace.get(booking.spaceId) ?? [];
    list.push(serializeBooking(booking));
    bySpace.set(booking.spaceId, list);
  }

  const activeSpaces = spaces.filter((space) => space.isActive);
  const capacitySlots = activeSpaces.length * SLOTS_PER_DAY;
  const usedSlots = bookedSlots(bookings);

  return {
    office: { id: office.id, name: office.name, city: office.city, timezone: office.timezone },
    date: dayKey,
    openTime: `${String(OFFICE_OPEN_HOUR).padStart(2, "0")}:00`,
    closeTime: `${String(OFFICE_CLOSE_HOUR).padStart(2, "0")}:00`,
    slotMinutes: SLOT_MINUTES,
    spaces: spaces.map((space) => ({
      id: space.id,
      name: space.name,
      type: space.type,
      capacity: space.capacity,
      isActive: space.isActive,
      bookings: bySpace.get(space.id) ?? [],
    })),
    totals: {
      activeSpaces: activeSpaces.length,
      bookings: bookings.length,
      bookedSlots: usedSlots,
      capacitySlots,
      occupancyPercent: occupancyPercent(usedSlots, capacitySlots),
    },
  };
}

/** Occupancy percentage per office for the upcoming `days` days. */
export async function getUsageStatistics({ days = 7, nowUtc = new Date() }) {
  const windowDays = Math.min(Math.max(Number.parseInt(days, 10) || 7, 1), 90);

  const offices = await prisma.office.findMany({
    include: { spaces: { select: { id: true, isActive: true } } },
    orderBy: { name: "asc" },
  });

  const report = [];
  for (const office of offices) {
    const todayKey = localDayKey(nowUtc, office.timezone);
    // Forward-looking for the same reason as the admin overview: bookings only
    // exist in the future, so statistics describe upcoming demand.
    const firstKey = todayKey;
    const lastKey = addDaysToDayKey(todayKey, windowDays - 1);
    const windowStartUtc = startOfLocalDayUtc(firstKey, office.timezone);
    const windowEndUtc = endOfLocalDayUtc(lastKey, office.timezone);

    const [activeBookings, cancelledCount] = await prisma.$transaction([
      prisma.booking.findMany({
        where: {
          status: "ACTIVE",
          space: { officeId: office.id },
          startUtc: { lt: windowEndUtc },
          endUtc: { gt: windowStartUtc },
        },
        select: { startUtc: true, endUtc: true, spaceId: true },
      }),
      prisma.booking.count({
        where: {
          status: "CANCELLED",
          space: { officeId: office.id },
          startUtc: { lt: windowEndUtc },
          endUtc: { gt: windowStartUtc },
        },
      }),
    ]);

    const activeSpaces = office.spaces.filter((space) => space.isActive).length;
    const capacitySlots = activeSpaces * SLOTS_PER_DAY * windowDays;
    const used = bookedSlots(activeBookings);

    const perDay = [];
    for (let index = 0; index < windowDays; index += 1) {
      const key = addDaysToDayKey(firstKey, index);
      const dayStart = startOfLocalDayUtc(key, office.timezone);
      const dayEnd = endOfLocalDayUtc(key, office.timezone);
      const dayBookings = activeBookings.filter(
        (booking) => booking.startUtc < dayEnd && booking.endUtc > dayStart,
      );
      perDay.push({ date: key, bookedSlots: bookedSlots(dayBookings), bookings: dayBookings.length });
    }

    report.push({
      office: { id: office.id, name: office.name, city: office.city, timezone: office.timezone },
      activeSpaces,
      days: windowDays,
      bookings: activeBookings.length,
      cancelledBookings: cancelledCount,
      bookedSlots: used,
      capacitySlots,
      occupancyPercent: occupancyPercent(used, capacitySlots),
      perDay,
    });
  }

  return { days: windowDays, offices: report };
}

function clampDays(value, fallback) {
  return Math.min(Math.max(Number.parseInt(value, 10) || fallback, 7), 90);
}

function percent(bookedSlots, capacitySlots) {
  return occupancyPercent(bookedSlots, capacitySlots);
}

/**
 * Everything the admin landing dashboard needs in one round trip: headline
 * totals, a utilisation trend, per-office occupancy, the desk/room split, the
 * busiest spaces and the next 24 hours of bookings.
 *
 * The company-wide `trend` is bucketed by **UTC** day so offices in different
 * time zones can share one axis; the per-office figures use each office's own
 * local day, which is what its staff experience. `trendTimezone` says so in the
 * payload rather than leaving the client to guess.
 */
export async function getAdminOverview({ windowDays = 14, nowUtc = new Date() } = {}) {
  const days = clampDays(windowDays, 14);

  const offices = await prisma.office.findMany({
    include: { spaces: { select: { id: true, type: true, isActive: true } } },
    orderBy: { name: "asc" },
  });

  const spaceMeta = new Map();
  for (const office of offices) {
    for (const space of office.spaces) {
      spaceMeta.set(space.id, {
        type: space.type,
        isActive: space.isActive,
        officeId: office.id,
        officeName: office.name,
      });
    }
  }
  const activeSpaceIds = [...spaceMeta.entries()]
    .filter(([, meta]) => meta.isActive)
    .map(([id]) => id);

  const todayUtc = localDayKey(nowUtc, "UTC");
  // Bookings can only be made for the future (see bookingRules.IN_THE_PAST), so a
  // window that looks backwards would always be empty. The dashboard therefore
  // measures the *upcoming* `days` days: today through today + days - 1.
  const firstUtcDay = todayUtc;
  const lastUtcDay = addDaysToDayKey(todayUtc, days - 1);
  const windowStartUtc = new Date(`${firstUtcDay}T00:00:00.000Z`);
  const windowEndUtc = new Date(`${addDaysToDayKey(lastUtcDay, 1)}T00:00:00.000Z`);
  const next24HoursUtc = new Date(nowUtc.getTime() + 24 * 3600 * 1000);

  const windowWhere = {
    status: "ACTIVE",
    ...(activeSpaceIds.length > 0 ? { spaceId: { in: activeSpaceIds } } : { spaceId: { in: [""] } }),
  };

  const [windowBookings, next24Hours, recentActivity, roleCounts, cancelledInWindow] =
    await Promise.all([
      prisma.booking.findMany({
        where: { ...windowWhere, startUtc: { gte: windowStartUtc, lt: windowEndUtc } },
        select: { startUtc: true, endUtc: true, spaceId: true },
      }),
      prisma.booking.findMany({
        where: {
          status: "ACTIVE",
          startUtc: { gte: nowUtc, lt: next24HoursUtc },
        },
        include: bookingInclude,
        orderBy: { startUtc: "asc" },
        take: 10,
      }),
      prisma.booking.findMany({
        include: bookingInclude,
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.booking.count({
        where: { status: "CANCELLED", startUtc: { gte: windowStartUtc, lt: windowEndUtc } },
      }),
    ]);

  const slotsOf = (booking) => minutesBetween(booking.startUtc, booking.endUtc) / SLOT_MINUTES;

  // --- Company trend (UTC buckets) -----------------------------------------
  const trend = [];
  const trendIndex = new Map();
  for (let index = 0; index < days; index += 1) {
    const key = addDaysToDayKey(firstUtcDay, index);
    const row = { date: key, bookings: 0, bookedSlots: 0 };
    trend.push(row);
    trendIndex.set(key, row);
  }

  const byOffice = new Map();
  const byType = new Map();
  const bySpace = new Map();
  let windowSlots = 0;

  for (const booking of windowBookings) {
    const slots = slotsOf(booking);
    windowSlots += slots;

    const row = trendIndex.get(localDayKey(booking.startUtc, "UTC"));
    if (row) {
      row.bookings += 1;
      row.bookedSlots += slots;
    }

    const meta = spaceMeta.get(booking.spaceId);
    if (!meta) continue;

    const officeRow = byOffice.get(meta.officeId) ?? { bookings: 0, bookedSlots: 0 };
    officeRow.bookings += 1;
    officeRow.bookedSlots += slots;
    byOffice.set(meta.officeId, officeRow);

    const typeRow = byType.get(meta.type) ?? { bookings: 0, bookedSlots: 0 };
    typeRow.bookings += 1;
    typeRow.bookedSlots += slots;
    byType.set(meta.type, typeRow);

    const spaceRow = bySpace.get(booking.spaceId) ?? { bookings: 0, bookedSlots: 0 };
    spaceRow.bookings += 1;
    spaceRow.bookedSlots += slots;
    bySpace.set(booking.spaceId, spaceRow);
  }

  // --- Per-office, using each office's own local day ------------------------
  const officeOccupancy = offices.map((office) => {
    const activeSpaces = office.spaces.filter((space) => space.isActive).length;
    const capacitySlots = activeSpaces * SLOTS_PER_DAY * days;
    const row = byOffice.get(office.id) ?? { bookings: 0, bookedSlots: 0 };

    const todayKey = localDayKey(nowUtc, office.timezone);
    const dayStart = startOfLocalDayUtc(todayKey, office.timezone);
    const dayEnd = endOfLocalDayUtc(todayKey, office.timezone);
    const todaysBookings = windowBookings.filter(
      (booking) => booking.startUtc < dayEnd && booking.endUtc > dayStart,
    );
    const todaySlots = todaysBookings.reduce((total, booking) => total + slotsOf(booking), 0);

    return {
      office: {
        id: office.id,
        name: office.name,
        city: office.city,
        timezone: office.timezone,
      },
      activeSpaces,
      bookings: row.bookings,
      bookedSlots: row.bookedSlots,
      capacitySlots,
      occupancyPercent: percent(row.bookedSlots, capacitySlots),
      bookingsToday: todaysBookings.length,
      occupancyTodayPercent: percent(todaySlots, activeSpaces * SLOTS_PER_DAY),
    };
  });

  const activeSpacesTotal = activeSpaceIds.length;
  const cancelledToday = cancelledInWindow;

  return {
    generatedAt: nowUtc.toISOString(),
    windowDays: days,
    trendTimezone: "UTC",
    totals: {
      offices: offices.length,
      activeSpaces: activeSpacesTotal,
      desks: [...spaceMeta.values()].filter((meta) => meta.isActive && meta.type === "DESK").length,
      rooms: [...spaceMeta.values()].filter((meta) => meta.isActive && meta.type === "ROOM").length,
      employees: roleCounts.find((row) => row.role === "EMPLOYEE")?._count._all ?? 0,
      admins: roleCounts.find((row) => row.role === "ADMIN")?._count._all ?? 0,
      bookingsInWindow: windowBookings.length,
      bookedSlotsInWindow: windowSlots,
      capacitySlotsInWindow: activeSpacesTotal * SLOTS_PER_DAY * days,
      occupancyInWindowPercent: percent(windowSlots, activeSpacesTotal * SLOTS_PER_DAY * days),
      cancelledInWindow: cancelledToday,
      occupancyTodayPercent: percent(
        officeOccupancy.reduce(
          (total, entry) => total + (entry.occupancyTodayPercent / 100) * entry.activeSpaces * SLOTS_PER_DAY,
          0,
        ),
        activeSpacesTotal * SLOTS_PER_DAY,
      ),
    },
    trend,
    officeOccupancy,
    spaceTypes: ["DESK", "ROOM"].map((type) => ({
      type,
      spaces: [...spaceMeta.values()].filter((meta) => meta.isActive && meta.type === type).length,
      bookings: byType.get(type)?.bookings ?? 0,
      bookedSlots: byType.get(type)?.bookedSlots ?? 0,
    })),
    busiestSpaces: [...bySpace.entries()]
      .map(([spaceId, row]) => {
        const meta = spaceMeta.get(spaceId);
        const office = offices.find((candidate) => candidate.id === meta?.officeId);
        const space = office?.spaces.find((candidate) => candidate.id === spaceId);
        return {
          space: {
            id: spaceId,
            name: space?.name ?? "Unknown space",
            type: meta?.type ?? "DESK",
          },
          office: { id: meta?.officeId, name: meta?.officeName },
          bookings: row.bookings,
          bookedSlots: row.bookedSlots,
        };
      })
      .sort((a, b) => b.bookedSlots - a.bookedSlots || b.bookings - a.bookings)
      .slice(0, 5),
    next24Hours: next24Hours.map(serializeBooking),
    recentActivity: recentActivity.map(serializeBooking),
  };
}

