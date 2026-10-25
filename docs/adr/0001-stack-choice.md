# 0001 — Stack choice: Node/Express + Prisma/PostgreSQL + React

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

DeskSpot has to be built end to end by one developer in a few days, and it has to
be reviewable by someone else afterwards. The two things the brief pushes hardest
on are (a) relational data with a real concurrency guarantee on overlapping
bookings, and (b) server-side enforcement of every business rule. The stack
therefore matters less for "is it shiny" and more for how quickly I can get a
correct, well-modelled data layer and how easy the result is to explain.

The bookable data is deeply relational: an office has spaces, a space has
bookings, a booking belongs to a user, and overlap is defined over time ranges.
There is also a genuine correctness requirement that no application-level
`if` can fully satisfy on its own (see [ADR 0002](0002-preventing-double-bookings.md)).

## Decision

- **Backend:** Node.js 22 + **Express 5** (ES modules), split into thin
  controllers, pure domain rules, and services that own transactions.
- **Data:** **PostgreSQL 16** with **Prisma 6**, using hand-written SQL inside the
  migrations for the parts Prisma's schema language cannot express
  (`btree_gist`, `EXCLUDE USING gist`).
- **Frontend:** **React 19 + Vite**, `react-router-dom` for routing, and
  hand-written CSS with a small set of component classes instead of a CSS
  framework.
- **Auth:** `jsonwebtoken` in an `httpOnly` cookie, `bcryptjs` for hashing.
- **Validation:** `zod` schemas at the HTTP boundary, with the domain rules kept
  as plain functions so they can be unit tested without a server.

## Why these choices

**Relational database, not a document store.** "One space, one booking at a
time" is a constraint over a range of keys. PostgreSQL lets me enforce that in
the database itself with a GiST exclusion constraint, which is the strongest
answer available to the interviewer's obvious question ("how do you stop two
people booking the same slot at the same moment?"). A document store would push
all of that into application code.

**Prisma, but not only Prisma.** Prisma gives typed queries, migrations and a
readable schema, which is where most of the value is at this size. It does not
model exclusion constraints, so those two migrations drop to raw SQL. Being able
to drop down is the reason I picked Prisma over a query builder.

**Express 5 over a batteries-included framework.** Express is small enough that
a reviewer can read `src/app.js` top to bottom and see every route and the exact
middleware order — which matters because the brief grades server-side role
checks. Express 5 also forwards async errors to the error handler natively, so
there is no `asyncHandler` wrapper noise.

**Plain CSS over a UI framework.** The UI needs a handful of layouts, not a
design system. Shipping ~13 kB of CSS and reading it in one file is easier to
justify in a code walkthrough than a framework's build output, and there is no
stale-utility-class problem to keep cleaning up.

**Pure domain functions.** `src/domain/bookingRules.js` has no I/O: it takes
plain values and returns a list of violations. Every rule the brief lists (slot
alignment, office hours, the 14-day horizon, the two-desks-per-day limit,
capacity, "in the past") is testable without a database, and the same function
is called by the API on every write.

## Consequences

- One language (JavaScript) across the stack keeps context switching low.
- The exclusion constraint is PostgreSQL-specific; moving to MySQL would mean
  reimplementing overlap safety with row locks only.
- Keeping the SQL migrations hand-written means Prisma's `migrate dev` drift
  checks are not used for those two files — they are applied with
  `prisma migrate deploy`, which is what the pipeline and the container run.
- Node's own `Intl` is enough for IANA time zones, so no timezone library is
  pulled in (see [ADR 0003](0003-time-and-time-zone-handling.md)).
