# 0002 — Preventing double bookings

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The rule is absolute: *a space can only have one booking at a time, and
overlapping bookings must be rejected*. The reviewer will test this by firing two
simultaneous requests for the same slot and expecting exactly one success.

A naive implementation — `SELECT` to see if the slot is free, then `INSERT` —
is wrong. Two requests can both pass the `SELECT` before either `INSERT` lands,
and both rows are written. This is a classic read-then-write race, and no amount
of care inside a single Node process fixes it, because more than one API instance
can serve the same request.

Interval overlap is also easy to get subtly wrong. Two intervals `[aStart, aEnd)`
and `[bStart, bEnd)` overlap when `aStart < bEnd && bStart < aEnd`. Using `<=` on
either side would wrongly reject touching bookings such as 10:00–11:00 followed
by 11:00–12:00, which the brief explicitly says must be accepted.

## Decision

Three layers, in order of authority:

1. **Pure rule** — `overlaps()` in `src/domain/bookingRules.js` uses the
   half-open comparison above and is unit tested, including the touching-edge
   cases.
2. **Serialised check inside a transaction** — `createBooking` runs everything in
   one `prisma.$transaction` that first takes two Postgres *transaction-scoped
   advisory locks*:

   ```sql
   SELECT pg_advisory_xact_lock(0x0de5cc07::int, hashtext($userId)::int);
   SELECT pg_advisory_xact_lock(0x0de5cc07::int, hashtext($spaceId)::int);
   ```

   The lock on the space serialises overlap checks for that space, so concurrent
   requests queue instead of racing. The lock on the user is needed because the
   "two active desk bookings per day" rule is a count across bookings — without
   it, two parallel requests could each observe a count of 1. Locks are always
   taken in the same order (user, then space) to avoid deadlocks, and being
   transaction-scoped, they are released automatically when the transaction ends.

3. **Database exclusion constraint** — the final source of truth:

   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;

   ALTER TABLE "bookings"
       ADD CONSTRAINT "bookings_no_overlap"
       EXCLUDE USING gist (
           "space_id" WITH =,
           tsrange("start_utc", "end_utc", '[)') WITH &&
       )
       WHERE ("status" = 'ACTIVE');
   ```

   Two ACTIVE ranges for the same space whose ranges overlap (`&&`) are
   impossible, whatever the application does. The `'[)'` bounds make the range
   half-open, so 10:00–11:00 and 11:00–12:00 coexist. The `WHERE` predicate means
   only ACTIVE rows participate, so cancelling frees the slot again while the
   cancelled row is kept as history.

If the constraint fires anyway (the lock was bypassed, e.g. a manual insert), the
Postgres error `23P01` / `bookings_no_overlap` is mapped to the same `409`
response as the application check, so clients cannot tell the difference.

Conflict responses are `409 Conflict` with
`{ "error": { "code": "BOOKING_CONFLICT", "message": "…" } }`, and the API also
checks `space.isActive`, capacity, slot alignment and the day limits before this
point so a `409` really does mean "someone else has it".

## Alternatives considered

- **Optimistic concurrency (version column + retry):** protects updates to a
  known row, but a booking *creates* a row — there is nothing to version yet. It
  would still need a retry loop around the insert.
- **`SERIALIZABLE` isolation only:** correct in principle, but it turns the whole
  transaction into a contention point and requires the application to handle and
  retry serialisation failures. Advisory locks scope the contention to one space.
- **Unique index on `(space_id, start_utc)`:** the obvious cheap trick, and it
  looks convincing in a schema review, but it only rejects bookings that start at
  exactly the same time. 10:00–11:00 followed by 10:30–11:30 would slip through.
  A range exclusion constraint is the correct primitive.
- **Application check only:** rejected outright — it is exactly the red flag the
  brief calls out.

## Consequences

- Overlap safety does not depend on there being a single API process; the
  database is the arbiter even with several replicas.
- Booking writes for the same space are serialised, which is the desired
  behaviour anyway (they are rare and short). Different spaces still run in
  parallel because the lock key includes the space id.
- `btree_gist` must be available. It ships with the official `postgres` image and
  is enabled on Neon/Supabase; the constraint is created by migration, so it
  fails loudly at deploy time rather than silently at runtime.
- The migrator role needs rights to create the extension.

## How to verify

```bash
# Inside backend/, against a migrated database:
npm test -- test/integration   # includes the conflict and concurrency cases
```

The integration suite also asserts that a booking touching an existing one's end
time is accepted, and that the third desk booking on the same day is rejected.
