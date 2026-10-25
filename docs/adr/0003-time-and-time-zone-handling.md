# 0003 — Storing and displaying time across offices

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

DeskSpot serves Islamabad, Riyadh and Copenhagen, and each office books against
its own local clock: a slot is only valid between 08:00 and 20:00 *in that
office's time zone*. Copenhagen also observes daylight saving while Islamabad and
Riyadh do not, so the same policy ("08:00 local") maps to different UTC instants
at different times of year.

Two failure modes had to be avoided:

1. Storing local wall-clock strings and comparing them as text. This silently
   breaks the moment two offices are compared, or the moment a DST transition
   makes two different local times collide or repeat.
2. Treating "the server's local time" as the office's local time. In a container
   the server is usually UTC, so 08:00 in Islamabad would be judged against the
   wrong wall clock.

## Decision

**Store absolute instants; derive wall-clock only for display.**

- `Booking.startUtc` / `endUtc` are `timestamp(3)` columns holding true UTC
  instants. The database has no notion of an office time zone — a booking is a
  point-in-time fact, not a wall-clock opinion.
- `Office.timezone` holds an **IANA identifier** (`Asia/Karachi`,
  `Asia/Riyadh`, `Europe/Copenhagen`), validated on the way in.
- All conversion lives in `src/lib/timezone.js` and is built on Node's built-in
  `Intl.DateTimeFormat`, so there is no `moment`/`luxon` dependency to justify.

**Request/response shape.** Clients never send a time zone with a booking. They
send a local day plus a 30-minute-aligned local window
(`officeId`, `date`, `from`, `to`), and the API resolves it against the office's
zone. Internally, the API accepts explicit ISO-8601 instants with an offset
(e.g. `2026-05-05T09:00:00+05:00`) and normalises them to UTC; a zone-less
string like `2026-05-05T09:00` is rejected, because guessing the zone is exactly
the ambiguity this ADR exists to remove. In responses, every booking carries
`startUtc`/`endUtc` **and** the office-local `date`, `localStartTime` and
`localEndTime`, so the UI can render without doing timezone maths.

**Resolving local → UTC.** `zonedTimeToUtc` formats the guessed timestamp in the
target zone to read the actual offset, subtracts it, and then re-checks the
offset once more at the corrected instant. The second pass is what keeps the
result stable across a DST boundary instead of landing an hour off.

**Business rules run in office-local terms.** `collectBookingViolations` checks
slot alignment with `getZonedParts` (a slot boundary must be a whole 30-minute
mark *in the office's zone*), office hours by comparing local hour/minute, and
the "at most two desk bookings per day" limit by converting the local day into
a UTC range (`startOfLocalDayUtc` … `endOfLocalDayUtc`) before counting.

## Consequences

- Overlap comparison is a plain numeric comparison of instants, which is what the
  GiST `tsrange` constraint in [ADR 0002](0002-preventing-double-bookings.md)
  relies on. DST changes shift the *mapping* to local time, never the ordering of
  instants, so no stored row becomes invalid when the clocks move.
- On the Copenhagen DST switch the local day is still 08:00–20:00; only the UTC
  offsets differ, and because bookings are stored as instants the 14-day horizon
  and day boundaries are computed correctly on both sides of the change.
- A consequence worth stating plainly: an instant that falls in the repeated
  hour when clocks go back is represented once, as an instant. Two different
  wall-clock readings that map to the same instant are the same booked moment —
  which is the correct outcome for a booking system.
- No third-party date library. `Intl` handles the IANA database, and it ships
  with Node and with every browser, so the frontend can render office-local times
  the same way.
- Cost: the `Formatters` cache in `timezone.js` exists because constructing
  `Intl.DateTimeFormat` is comparatively expensive; callers must pass a valid IANA
  name, which is enforced at the API boundary for offices.
