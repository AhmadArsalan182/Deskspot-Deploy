import { describe, expect, it } from "vitest";
import {
  addDaysToDayKey,
  endOfLocalDayUtc,
  formatLocalDateTime,
  formatLocalTime,
  localDayKey,
  localDateTimeToUtc,
  startOfLocalDayUtc,
} from "../../src/lib/timezone.js";

describe("zonedTimeToUtc", () => {
  it("converts Karachi wall clock (UTC+05:00, no DST)", () => {
    const instant = localDateTimeToUtc("2026-05-02", "10:00", "Asia/Karachi");
    expect(instant.toISOString()).toBe("2026-05-02T05:00:00.000Z");
  });

  it("converts Copenhagen wall clock in winter (UTC+01:00)", () => {
    const instant = localDateTimeToUtc("2026-01-15", "12:00", "Europe/Copenhagen");
    expect(instant.toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });

  it("converts Copenhagen wall clock in summer (UTC+02:00)", () => {
    const instant = localDateTimeToUtc("2026-07-01", "12:00", "Europe/Copenhagen");
    expect(instant.toISOString()).toBe("2026-07-01T10:00:00.000Z");
  });

  it("handles the DST spring-forward day", () => {
    // 2026-03-29: clocks jump 01:00 -> 02:00 in Copenhagen, so 09:00 local is UTC+02:00.
    const instant = localDateTimeToUtc("2026-03-29", "09:00", "Europe/Copenhagen");
    expect(instant.toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });
});

describe("local day helpers", () => {
  it("derives the office-local day from a UTC instant", () => {
    const instant = localDateTimeToUtc("2026-05-02", "09:00", "Asia/Karachi");
    expect(localDayKey(instant, "Asia/Karachi")).toBe("2026-05-02");
    // The same instant is still the previous day in New York.
    expect(localDayKey(instant, "America/New_York")).toBe("2026-05-02");
    expect(localDayKey(localDateTimeToUtc("2026-05-02", "01:00", "Asia/Karachi"), "America/New_York")).toBe("2026-05-01");
  });

  it("computes day boundaries as UTC instants", () => {
    const start = startOfLocalDayUtc("2026-05-02", "Asia/Karachi");
    const end = endOfLocalDayUtc("2026-05-02", "Asia/Karachi");
    expect(start.toISOString()).toBe("2026-05-01T19:00:00.000Z");
    expect(end.toISOString()).toBe("2026-05-02T19:00:00.000Z");
  });

  it("adds days across a month boundary", () => {
    expect(addDaysToDayKey("2026-05-30", 3)).toBe("2026-06-02");
    expect(addDaysToDayKey("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("formatting", () => {
  it("formats an instant as office-local time", () => {
    const instant = new Date("2026-05-02T05:00:00.000Z");
    expect(formatLocalTime(instant, "Asia/Karachi")).toBe("10:00");
    expect(formatLocalDateTime(instant, "Asia/Karachi")).toBe("2026-05-02 10:00");
  });
});
