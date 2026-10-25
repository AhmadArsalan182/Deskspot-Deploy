-- Database-level guard against double bookings.
--
-- The API also checks overlaps inside a transaction that holds a per-space
-- advisory lock, but this exclusion constraint is the final source of truth:
-- even if two requests race past the application check, Postgres will reject
-- the second INSERT. Only ACTIVE bookings participate, so cancelling a booking
-- frees the slot again.
--
-- Requires the btree_gist extension (bundled with the official Postgres image
-- and available on Supabase / Neon / RDS).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_no_overlap"
    EXCLUDE USING gist (
        "space_id" WITH =,
        tsrange("start_utc", "end_utc", '[)') WITH &&
    )
    WHERE ("status" = 'ACTIVE');
