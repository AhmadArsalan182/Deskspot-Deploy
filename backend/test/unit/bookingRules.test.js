import { describe, expect, it } from "vitest";
import {
  collectBookingViolations,
  isSlotAligned,
  isWithinOfficeHours,
  overlaps,
} from "../../src/domain/bookingRules.js";
import { zonedTimeToUtc } from "../../src/lib/timezone.js";

const KARACHI = "Asia/Karachi"; // UTC+05:00, no DST
const COPENHAGEN = "Europe/Copenhagen"; // UTC+01:00 / UTC+02:00

/** Build a UTC instant from an office-local wall clock. */
function local(timeZone, day, time) {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return zonedTimeToUtc({ year, month, day: date, hour, minute }, timeZone);
}

const desk = { id: "space-desk", type: "DESK", capacity: 1, isActive: true };
const room = { id: "space-room", type: "ROOM", capacity: 6, isActive: true };

/** A "now" that is comfortably before the booking under test. */
const NOW = local(KARACHI, "2026-05-01", "08:00");

function validate(overrides = {}) {
  return collectBookingViolations({
    space: desk,
    timeZone: KARACHI,
    startUtc: local(KARACHI, "2026-05-02", "10:00"),
    endUtc: local(KARACHI, "2026-05-02", "11:00"),
    attendees: 1,
    nowUtc: NOW,
    activeDeskBookingsOnLocalDay: 0,
    ...overrides,
  });
}

function codes(violations) {
  return violations.map((violation) => violation.code);
}

describe("overlaps (half-open intervals)", () => {
  const start = (hour, minute = 0) => new Date(Date.UTC(2026, 4, 9, hour, minute));
  const end = (hour, minute = 0) => new Date(Date.UTC(2026, 4, 9, hour, minute));

  it("flags a partial overlap", () => {
    expect(overlaps(start(10), end(11), start(10, 30), end(11, 30))).toBe(true);
  });

  it("flags a fully contained booking", () => {
    expect(overlaps(start(10), end(12), start(10, 30), end(11))).toBe(true);
  });

  it("does not flag touching edges", () => {
    expect(overlaps(start(10), end(11), start(11), end(12))).toBe(false);
  });

  it("does not flag bookings on different days", () => {
    const otherDay = new Date(Date.UTC(2026, 4, 10, 10));
    expect(overlaps(start(10), end(11), otherDay, new Date(Date.UTC(2026, 4, 10, 11)))).toBe(false);
  });
});

describe("slot alignment", () => {
  it("accepts 30-minute boundaries", () => {
    expect(isSlotAligned(local(KARACHI, "2026-05-02", "10:00"), KARACHI)).toBe(true);
    expect(isSlotAligned(local(KARACHI, "2026-05-02", "10:30"), KARACHI)).toBe(true);
  });

  it("rejects 10:15", () => {
    expect(isSlotAligned(local(KARACHI, "2026-05-02", "10:15"), KARACHI)).toBe(false);
    expect(codes(validate({
      startUtc: local(KARACHI, "2026-05-02", "10:15"),
      endUtc: local(KARACHI, "2026-05-02", "10:45"),
    }))).toContain("SLOT_ALIGNMENT");
  });

  it("rejects a booking that is not a whole number of slots", () => {
    expect(codes(validate({
      startUtc: local(KARACHI, "2026-05-02", "10:00"),
      endUtc: local(KARACHI, "2026-05-02", "11:20"),
    }))).toContain("SLOT_ALIGNMENT");
  });
});

describe("office hours", () => {
  it("accepts a window inside 08:00–20:00 local", () => {
    expect(isWithinOfficeHours(
      local(KARACHI, "2026-05-02", "09:00"),
      local(KARACHI, "2026-05-02", "10:00"),
      KARACHI,
    )).toBe(true);
  });

  it("rejects a booking that starts before opening", () => {
    expect(codes(validate({
      startUtc: local(KARACHI, "2026-05-02", "07:30"),
      endUtc: local(KARACHI, "2026-05-02", "08:30"),
    }))).toContain("OUTSIDE_OFFICE_HOURS");
  });

  it("rejects 19:30–20:30 in Copenhagen local time", () => {
    const violations = validate({
      timeZone: COPENHAGEN,
      startUtc: local(COPENHAGEN, "2026-05-02", "19:30"),
      endUtc: local(COPENHAGEN, "2026-05-02", "20:30"),
      nowUtc: local(COPENHAGEN, "2026-05-01", "08:00"),
    });
    expect(codes(violations)).toContain("OUTSIDE_OFFICE_HOURS");
  });

  it("accepts 20:00 as an exclusive end boundary", () => {
    expect(isWithinOfficeHours(
      local(KARACHI, "2026-05-02", "19:00"),
      local(KARACHI, "2026-05-02", "20:00"),
      KARACHI,
    )).toBe(true);
  });
});

describe("advance booking limit", () => {
  it("accepts a booking exactly 14 days ahead", () => {
    expect(codes(validate({
      startUtc: local(KARACHI, "2026-05-15", "10:00"),
      endUtc: local(KARACHI, "2026-05-15", "11:00"),
    }))).not.toContain("ADVANCE_LIMIT");
  });

  it("rejects a booking 15 days ahead", () => {
    expect(codes(validate({
      startUtc: local(KARACHI, "2026-05-16", "10:00"),
      endUtc: local(KARACHI, "2026-05-16", "11:00"),
    }))).toContain("ADVANCE_LIMIT");
  });
});

describe("desk bookings per day", () => {
  it("allows a second desk booking on the same day", () => {
    expect(codes(validate({ activeDeskBookingsOnLocalDay: 1 }))).not.toContain("DESK_DAILY_LIMIT");
  });

  it("rejects a third desk booking on the same day", () => {
    expect(codes(validate({ activeDeskBookingsOnLocalDay: 2 }))).toContain("DESK_DAILY_LIMIT");
  });

  it("does not apply the desk limit to rooms", () => {
    expect(codes(validate({ space: room, attendees: 4, activeDeskBookingsOnLocalDay: 5 }))).not.toContain("DESK_DAILY_LIMIT");
  });
});

describe("capacity", () => {
  it("rejects 8 attendees in a room that seats 6", () => {
    expect(codes(validate({ space: room, attendees: 8 }))).toContain("CAPACITY_EXCEEDED");
  });

  it("accepts attendees up to capacity", () => {
    expect(codes(validate({ space: room, attendees: 6 }))).not.toContain("CAPACITY_EXCEEDED");
  });

  it("rejects more than one attendee for a single desk", () => {
    expect(codes(validate({ attendees: 2 }))).toContain("CAPACITY_EXCEEDED");
  });

  it("rejects zero attendees", () => {
    expect(codes(validate({ attendees: 0 }))).toContain("ATTENDEES_INVALID");
  });
});

describe("other rules", () => {
  it("rejects an end before the start", () => {
    expect(codes(validate({
      startUtc: local(KARACHI, "2026-05-02", "11:00"),
      endUtc: local(KARACHI, "2026-05-02", "10:00"),
    }))).toContain("INVALID_RANGE");
  });

  it("rejects a booking in the past", () => {
    expect(codes(validate({
      startUtc: local(KARACHI, "2026-04-30", "10:00"),
      endUtc: local(KARACHI, "2026-04-30", "11:00"),
    }))).toContain("IN_THE_PAST");
  });

  it("rejects booking a deactivated space", () => {
    expect(codes(validate({ space: { ...desk, isActive: false } }))).toContain("SPACE_INACTIVE");
  });

  it("accepts a fully valid booking", () => {
    expect(validate()).toEqual([]);
  });
});
