import { describe, expect, it } from "vitest";
import { expandRecurringDates } from "../../src/domain/recurringPattern.js";

describe("expandRecurringDates", () => {
  it("expands weekdays within the horizon", () => {
    const dates = expandRecurringDates({
      startDate: "2026-11-02", // Monday
      endDate: "2026-11-13",
      weekdays: [1, 3, 5],
      timeZone: "UTC",
      nowUtc: new Date("2026-11-01T12:00:00Z"),
    });
    expect(dates).toEqual([
      "2026-11-02",
      "2026-11-04",
      "2026-11-06",
      "2026-11-09",
      "2026-11-11",
      "2026-11-13",
    ]);
  });

  it("picks Sundays when weekday 7 is requested", () => {
    const dates = expandRecurringDates({
      startDate: "2026-11-02",
      count: 2,
      weekdays: [7],
      timeZone: "UTC",
      nowUtc: new Date("2026-11-02T12:00:00Z"),
    });
    expect(dates).toEqual(["2026-11-08", "2026-11-15"]);
  });

  it("returns empty for an empty weekday filter after horizon clamp", () => {
    const dates = expandRecurringDates({
      startDate: "2026-11-02",
      endDate: "2026-11-02",
      weekdays: [7],
      timeZone: "UTC",
      nowUtc: new Date("2026-11-02T12:00:00Z"),
    });
    expect(dates).toEqual([]);
  });
});
