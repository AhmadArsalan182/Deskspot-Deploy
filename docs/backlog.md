# DeskSpot backlog

The brief asks for work tracked as user stories with small commits. There is no
external board for this submission, so the board lives here: one row per story,
with the commit prefix used for it and the current state. Stories are in the
brief's own numbering so a reviewer can line them up against the acceptance
criteria.

Commit messages use the story id as a prefix (`F4: reject non-aligned slots …`)
so `git log --grep F4` reconstructs the history for one story.

## Status board

| ID | Tier | Story | State |
| -- | ---- | ----- | ----- |
| F1 | Must | Register and log in | Done |
| F2 | Must | Admin manages offices and spaces | Done |
| F3 | Must | Employee finds a free space | Done |
| F4 | Must | Employee books a space, rules enforced server-side | Done |
| F5 | Must | Employee sees and cancels their bookings | Done |
| F6 | Should | Admin sees the day's occupancy, cancels with a reason | Done |
| F7 | Should | Responsive, accessible UI | Done |
| F8 | Should | Booking confirmation and cancellation notice | Done |
| F9 | Stretch | Admin usage statistics | Done |
| F10 | Stretch | Recurring booking | Not started |
| F11 | Stretch | Real-time availability | Not started |

## Notes per story

**F1 — Register and log in.** Email + password, bcrypt hashes, JWT in an
`httpOnly` cookie with an 8-hour expiry, generic "invalid email or password"
message so the response does not reveal which half was wrong. Login is
rate-limited to 20 attempts per 15 minutes per IP.

**F2 — Offices and spaces.** Full CRUD behind `authorize("ADMIN")` on the server.
Spaces have a name, type (desk/room), capacity and an active flag; deactivating
rather than deleting keeps booking history readable. Admin screens are only
mounted for admins, and a direct API call without the role gets a `403`.

**F3 — Availability search.** `GET /api/availability?officeId&date&from&to&type`
returns every matching space with an `available` flag and the intervals that are
already busy, so the UI can show *why* something is unavailable instead of just
hiding it.

**F4 — Booking.** Every rule is evaluated server-side by
`collectBookingViolations` before the insert: 30-minute alignment, office hours
in the office's zone, the 14-day horizon, no bookings in the past, capacity,
active space, and at most two active desk bookings per office-local day. Each
violation carries its own code and message.

**F5 — My bookings.** `GET /api/bookings/me?scope=upcoming|past|all` with
pagination. Only future, still-active bookings can be cancelled. Cancellations of
someone else's booking return `404` rather than `403`, so an employee cannot
probe for the existence of other people's booking ids.

**F6 — Daily occupancy.** `GET /api/admin/occupancy?officeId&date` returns each
space with its bookings for that office-local day, plus totals. Admin
cancellation requires a reason (at least 3 characters), which is stored on the
booking and surfaced to the employee.

**F7 — Responsive, accessible UI.** Layout collapses below 900 px and is usable
at 375 px; every input has a label; `:focus-visible` outlines are present;
loading and empty states are rendered for each data view; notices use
`role="alert"` / `role="status"`.

**F8 — Confirmation.** Confirmation on booking, notice on employee cancellation,
and a distinct "cancelled by an administrator" notice including the reason.
Delivered in-app, persisted as `Notification` rows and listed on the dashboard
with unread counts. The brief allows a mocked sender; in-app is the honest
version of the same requirement and needs no mail provider to demo.

**F9 — Usage statistics.** `GET /api/admin/statistics?days=7|14|30` returns
occupancy percentage per office, plus a per-day breakdown of bookings and booked
slots against total capacity.

**F10 — Recurring bookings.** Not implemented. See "What I would do next" in the
[README](../README.md).

**F11 — Real-time availability.** Not implemented. Availability refreshes on
demand (changing a filter re-runs the search) rather than pushing updates.
