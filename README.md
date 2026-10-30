# DeskSpot

A desk and meeting-room booking portal for hybrid offices. Employees search for a
free desk or room, book it in 30-minute slots and cancel it again; office admins
manage the offices and spaces, watch a day's occupancy, and cancel any booking
with a reason. The admin console leads with a **dashboard of charts** (occupancy,
demand trend, desk-vs-room split, busiest spaces) and a statistics screen, and the
public site opens on a **portal picker** so the employee and administrator
entrances can never be mixed up.

Built as the *Joiner Web Dev Assignment* for a consulting firm with offices in
Islamabad, Riyadh and Copenhagen — three offices, three time zones, one booking
rule set.

- **API:** Node.js 22 · Express 5 · Prisma 6 · PostgreSQL 16
- **Web:** React 19 · Vite · react-router-dom · hand-written CSS
- **Auth:** JWT in an `httpOnly` cookie (Bearer header also accepted), bcrypt
- **Tests:** Vitest — pure rule unit tests plus API integration tests against a
  real PostgreSQL database

---

## Quick start

**Windows, no Docker (recommended for local work):** install Node.js 22 and
PostgreSQL 16, then follow *Running it on Windows* below.

**One command with Docker** (optional — only if Docker Desktop is installed):

```bash
git clone <repository-url>
cd Deskspot
docker compose up --build
```

Then open **http://localhost:8080**. The API docs are at
**http://localhost:4000/api/docs**.

### Test credentials

The web app opens on a portal picker: choose **Employee** or **Administrator**,
then sign in or register. The API refuses to sign an account in through the other
portal (`403 ROLE_MISMATCH`), so pick the matching one:

| Role | Email | Password |
| ---- | ----- | -------- |
| Admin | `admin@deskspot.test` | `Admin123!` |
| Employee | `employee@deskspot.test` | `Employee123!` |
| Employee | `sara@deskspot.test` | `Employee123!` |

Seed data: 3 offices, 16 spaces, 3 users and a few bookings for the next two days
so the admin views are not empty. Seeding is idempotent — restarting the
containers will not duplicate rows.

---

## Running it on Windows

You need two installers: **Node.js 22 LTS** and **PostgreSQL 16**. You do **not**
need Docker or a special Vite setup — `frontend/vite.config.js` is already
wired (dev server on port 5173, `/api` proxied to the Express API on 4000).

### A. Install Node.js

1. Open https://nodejs.org/
2. Download the **LTS** Windows installer (22.x).
3. Run it. Keep the defaults. Make sure **“Add to PATH”** is checked.
4. Close any open terminals, open a **new** PowerShell, and check:

```powershell
node -v
npm -v
```

You should see `v22…` (or at least v20+) and an npm version.

### B. Install PostgreSQL 16

1. Open https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
2. Download **PostgreSQL 16 for Windows x86-64**.
3. Run the installer.
4. Click **Next** through the install location.
5. On **Select Components**, keep at least **PostgreSQL Server**, **pgAdmin 4**,
   **Command Line Tools**. Click Next.
6. Data directory: leave the default. Click Next.
7. **Password:** type a password for the `postgres` user and write it down.
   Example used below: `postgres` (you can pick anything — just reuse it in `.env`).
8. **Port:** leave **5432**. Click Next.
9. Locale: leave default. Click Next, then Install.
10. Stack Builder can be skipped (uncheck / Cancel). Finish.

### C. Create the `deskspot` database in pgAdmin

1. Open **pgAdmin 4** from the Start menu.
2. The first launch asks you to set a **master password** for pgAdmin itself
   (this is not the database password). Choose one and save it.
3. In the left tree, click **Servers**. Enter the `postgres` password from step B7
   when asked to connect.
4. Expand **Servers → PostgreSQL 16 → Databases**.
5. Right-click **Databases → Create → Database…**
6. **Database** name: `deskspot`
7. Click **Save**.
8. (Optional, for tests) Create a second database named `deskspot_test` the same way.

### D. Configure and start the API

In PowerShell, from the project folder:

```powershell
cd D:\PROJECTS\Deskspot\backend
copy .env.example .env
notepad .env
```

Change these two lines to match your PostgreSQL password from step B7:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/deskspot?schema=public"
JWT_SECRET="any-long-random-string-at-least-32-characters"
```

If your password contains `@`, `#`, `/` or `%`, URL-encode it (for example
`@` becomes `%40`). Save and close Notepad.

```powershell
npm install
npx prisma generate
npm run db:setup
npm run dev
```

Leave this window open. You should see:

`DeskSpot API listening on http://0.0.0.0:4000`

Open http://localhost:4000/api/health — it should return `{ "status": "ok", … }`.
API docs: http://localhost:4000/api/docs

### E. Start the web app (Vite)

Open a **second** PowerShell:

```powershell
cd D:\PROJECTS\Deskspot\frontend
npm install
npm run dev
```

Open **http://localhost:5173** and sign in with the demo accounts below.

Vite is already configured. You do not create a Vite project from scratch.

---

## Tests

```bash
cd backend
npm test                      # unit + integration
npm run test:unit             # pure booking rules and timezone helpers
npm run test:integration      # API tests, needs a database
npm run lint

cd ../frontend
npm test                      # component tests
npm run lint
npm run build
```

The integration suite needs a migrated database. It reads
`TEST_DATABASE_URL` and falls back to `DATABASE_URL`; if neither is set the suite
reports itself skipped instead of failing, so a fresh clone can run
`npm run test:unit` with no database at all.

```bash
createdb deskspot_test
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/deskspot_test?schema=public" \
  npx prisma migrate deploy
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/deskspot_test?schema=public" \
  npm test
```

Coverage is collected by `vitest --coverage` (see the CI pipeline), which uploads
the report as a build artefact. The booking rules in
`src/domain/bookingRules.js` are covered case by case: overlap, touching edges,
slot alignment, office hours, the 14-day horizon, the two-desks-per-day limit,
capacity and past bookings.

---

## Environment variables

Set in `backend/.env` (see [`backend/.env.example`](backend/.env.example)). None
of these are committed; `JWT_SECRET` has no safe default in production and the
API refuses to start without one when `NODE_ENV=production`.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NODE_ENV` | `development` | `production` enables strict secret checks and hides stack traces |
| `PORT` | `4000` | API port |
| `DATABASE_URL` | — | `postgresql://user:pass@host:5432/deskspot?schema=public` |
| `TEST_DATABASE_URL` | — | Optional; keeps integration tests off dev data |
| `JWT_SECRET` | dev-only value | Signing key; **must** be set in production |
| `JWT_EXPIRES_IN` | `8h` | Session lifetime |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed CORS origin(s); comma-separate for Vercel + localhost |
| `ADMIN_INVITE_CODE` | `DESKSPOT-ADMIN` | Shared code required to register an administrator |
| `EXPOSE_RESET_TOKEN` | dev-only `true` | Returns the password-reset token in the response when no mail transport exists |

`EXPOSE_RESET_TOKEN` defaults to `true` outside production so a reviewer can
finish the reset flow locally. Leave it **unset** in production and wire a real
email sender; the API still issues the token, it is just not echoed back.

The web client calls relative `/api` locally (Vite proxy). On Vercel, set
`VITE_API_URL` to the public API origin (see *Deployment*).

---

## API

Base URL `/api`. Interactive docs: **`/api/docs`** (Swagger UI), machine-readable
spec: **`/api/openapi.json`**.

| Method | Endpoint | Who |
| ------ | -------- | --- |
| `POST` | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Public |
| `POST` | `/api/auth/forgot-password`, `/api/auth/reset-password` | Public |
| `GET` | `/api/auth/session` | Authenticated |
| `GET` | `/api/offices`, `/api/offices/:id`, `/api/offices/:id/spaces` | Authenticated |
| `POST`/`PUT`/`PATCH`/`DELETE` | `/api/offices`, `/api/offices/:id` | Admin |
| `GET` | `/api/spaces` | Authenticated |
| `POST`/`PUT`/`PATCH`/`DELETE` | `/api/spaces`, `/api/spaces/:id` | Admin |
| `GET` | `/api/availability?officeId&date&from&to&type` | Authenticated |
| `POST` | `/api/bookings` | Authenticated |
| `GET` | `/api/bookings/me?scope=upcoming\|past\|all` | Authenticated |
| `GET` | `/api/bookings?officeId&date&status` | Admin |
| `POST` | `/api/bookings/:id/cancel` (also `DELETE /api/bookings/:id`) | Owner or Admin |
| `GET` | `/api/admin/overview?days=14` | Admin |
| `GET` | `/api/admin/occupancy?officeId&date` | Admin |
| `GET` | `/api/admin/statistics?days=7` | Admin |
| `GET` | `/api/notifications` | Authenticated |
| `GET` | `/api/health` | Public |

### Conventions

**Status codes.** `200`/`201` success, `204` for a delete with no body, `400` for
a validation or business-rule failure, `401` when there is no valid session (an
invalid password adds `details.attemptsRemaining`), `403` when the session is
valid but the role is not allowed (`ROLE_REQUIRED`) or the account belongs to the
other portal (`ROLE_MISMATCH`), `404` when a resource does not exist *or* belongs
to someone else, `409` for a conflict (overlapping booking, duplicate email,
already-cancelled booking), `423 ACCOUNT_LOCKED` once an account is locked after
too many failures, `429 RATE_LIMITED` when a client or a credential endpoint is
throttled, `500` for anything unexpected.

**Error body.** Every failure — including `404` and `500` — returns the same
shape, so the client has exactly one thing to parse:

```json
{
  "error": {
    "code": "BOOKING_CONFLICT",
    "message": "This space is already booked for part of that time.",
    "details": [{ "code": "BOOKING_CONFLICT", "message": "…" }]
  }
}
```

`code` is stable and machine-readable (`VALIDATION_ERROR`, `BOOKING_CONFLICT`,
`CAPACITY_EXCEEDED`, `OUTSIDE_OFFICE_HOURS`, `DESK_DAILY_LIMIT`, `ROLE_REQUIRED`,
`ROLE_MISMATCH`, `ADMIN_INVITE_REQUIRED`, `ACCOUNT_LOCKED`, `RATE_LIMITED`,
`RESET_TOKEN_INVALID`, …);
`message` is written for a person; `details` appears when several rules failed at
once or when a request failed validation, and lists each offending field.

**Pagination.** List endpoints that can grow return an envelope, defaulting to 20
rows and capping at 100:

```json
{ "items": [ … ], "pagination": { "page": 1, "pageSize": 20, "total": 43, "totalPages": 3 } }
```

**Validation.** Every request body and query string passes through a `zod`
schema before a controller sees it. Instants must carry an explicit UTC offset
(`2026-05-01T09:00:00+05:00`); a zone-less timestamp is rejected rather than
guessed. Bookings can also be expressed as an office-local `date` plus `from`
and `to`, which the API resolves against the office's time zone.

---

## Data model

```
Office 1─* Space 1─* Booking *─1 User
```

- `Office` — name, city, IANA `timezone`.
- `Space` — name, type (`DESK`/`ROOM`), capacity, `isActive`. Deactivated spaces
  keep their history but cannot be booked.
- `Booking` — `spaceId`, `userId`, `startUtc`, `endUtc`, `attendees`,
  `status` (`ACTIVE`/`CANCELLED`), `cancelReason`, who cancelled it and when.
- `Notification` — in-app messages created when a booking is confirmed or
  cancelled, with a read flag.

Times are stored as absolute UTC instants; office-local wall-clock values are
derived on read. Indexes exist on `(spaceId, startUtc, endUtc)` plus the
exclusion constraint described below.

---

## Business rules

All of these are enforced **server-side on every write**, in
`src/domain/bookingRules.js`, and again in the UI only to give immediate
feedback:

| Rule | Failure |
| ---- | ------- |
| Slots are 30 minutes and must start and end on a slot boundary | `400 SLOT_ALIGNMENT` |
| Bookings fit inside office hours (08:00–20:00 **office-local**) | `400 OUTSIDE_OFFICE_HOURS` |
| At most 14 days ahead | `400 ADVANCE_LIMIT` |
| Start must be in the future | `400 IN_THE_PAST` |
| Attendees ≤ space capacity | `400 CAPACITY_EXCEEDED` |
| A space cannot be double-booked | `409 BOOKING_CONFLICT` |
| An employee holds at most 2 active desk bookings per office-local day | `400 DESK_DAILY_LIMIT` |
| Deactivated spaces cannot be booked | `400 SPACE_INACTIVE` |
| Employees cancel only their own future bookings; admins cancel anything **with a reason** | `404` / `400` |

Intervals are half-open `[start, end)`, so 10:00–11:00 followed by 11:00–12:00 is
**not** a conflict — that case is asserted in the integration tests.

### How double bookings are actually prevented

Two layers, the second of which is the one that matters under concurrency:

1. `createBooking` runs the overlap check and the insert in a single transaction
   that first takes Postgres transaction-scoped advisory locks on the acting user
   and then on the space, so concurrent bookings for the same space queue behind
   each other instead of racing.
2. A database exclusion constraint is the backstop:

   ```sql
   ALTER TABLE "bookings"
     ADD CONSTRAINT "bookings_no_overlap"
     EXCLUDE USING gist ("space_id" WITH =, tsrange("start_utc","end_utc",'[)') WITH &&)
     WHERE ("status" = 'ACTIVE');
   ```

   Even if two requests somehow slip past the application check, the second
   insert is rejected by PostgreSQL and translated into the same `409`.
   See [ADR 0002](docs/adr/0002-preventing-double-bookings.md).

---

## Security

- Passwords hashed with bcrypt (10 rounds); a failed login returns one generic
  message (no email enumeration) plus `details.attemptsRemaining`. Three
  consecutive failures lock the account for 15 minutes (`423 ACCOUNT_LOCKED`),
  and even the correct password is refused while the lock holds.
- **Rate limits.** A global 300 requests / minute / IP safety net on `/api`
  (health checks exempt), plus tighter budgets on the credential endpoints:
  login 10 / 15 min, registration 10 / 60 min, password reset 5 / 15 min. All
  answer with `429 RATE_LIMITED`. Together with the per-account lockout this
  covers both single-IP and distributed brute-force attempts.
- **Password reset.** `POST /api/auth/forgot-password` issues a single-use,
  60-minute token (only its SHA-256 hash is stored, so a database leak cannot be
  replayed); requesting a new link invalidates the previous one. The response is
  identical for unknown emails. A successful reset clears the lockout and the
  failure counter.
- **Separate portals.** The sign-in page asks whether the visitor is an Employee
  or an Administrator first. Every downstream call carries that choice and the
  API enforces it: an account can only sign in through its own portal
  (`403 ROLE_MISMATCH`), and administrator registration needs the shared
  `ADMIN_INVITE_CODE` (`403 ADMIN_INVITE_REQUIRED`).
- JWT in an `httpOnly` cookie (`sameSite=lax` in development, `sameSite=none` +
  `secure` in production so the app can be split across hosts; Bearer tokens are
  also accepted for scripted checks); 8-hour expiry; the cookie is cleared on
  logout.
- Role checks on the server for every admin route via `authorize("ADMIN")` — the
  hidden admin menu in the UI is a convenience, not the control. Employee screens
  never call admin services, so an admin payload cannot appear in the dev tools
  of an employee session.
- No IDOR: asking for another employee's booking returns `404`, not `403`, so the
  response cannot be used to confirm that an id exists.
- `helmet` security headers, CORS restricted to `FRONTEND_ORIGIN`, JSON body size
  capped at 100 kB, and all database access through Prisma/parameterised SQL.
- Secrets only via environment variables; `.env` is git-ignored and
  `.env.example` documents every key. React escapes rendered strings, so a space
  named `<script>alert(1)</script>` is displayed as text.

---

## Assumptions and trade-offs

Where the brief was silent I made a call and wrote it down here.

**Scope**

1. **In-app notifications instead of email (F8).** The brief allows a mocked
   sender; persisted, unread-counted notifications are the same requirement
   without an external provider, and they are visible in a review.
2. **F10 (recurring) and F11 (SSE availability) are implemented.** Recurring
   bookings report per-date outcomes; availability streams are in-process SSE
   (fine for a single Render instance). The booking form still hides elapsed
   slots for the selected day, and the server rejects past starts
   (`400 IN_THE_PAST`).
3. **The admin analytics window looks forward, not back.** Bookings can only be
   created for the future (`IN_THE_PAST`), so a retrospective window would always
   be empty. `/api/admin/overview` and `/api/admin/statistics` therefore describe
   the *upcoming* `days` days — today through today + days − 1 — which is what
   makes the dashboard charts reflect real demand.
4. **An office's time zone is fixed at creation.** Real offices occasionally
   change zones; nothing in the model prevents editing it, but existing bookings
   would then be re-interpreted. I chose not to add a migration path for it.

**Rules**

5. **"At most 2 active desk bookings per day" is per office-local day and counts
   desks only.** Rooms are not limited, which is the reading that makes the rule
   useful (a person can hold one desk and still book several rooms of different
   sizes). Cancelled bookings do not count, so cancelling frees the quota.
6. **"14 days ahead" means today plus 14 calendar days**, inclusive, in the
   office's local time.
7. **Attendees are required for rooms and default to 1.** The brief only demands
   a count that does not exceed capacity, so desks accept the default.
8. **Booking horizon and "in the past" are evaluated at insert time** (server
   clock). A future booking is not re-validated later; it stays valid even if the
   space is deactivated afterwards.
9. **Minimum booking length is 30 minutes and there is no maximum** other than
   the closing time, because the brief sets no upper bound.
10. **Cancellations are soft.** A cancelled booking keeps its row with
   `status = CANCELLED`, which preserves history and frees the slot thanks to the
   constraint's `WHERE status = 'ACTIVE'` predicate.

**Design**

11. **Advisory locks plus an exclusion constraint rather than `SERIALIZABLE`
    isolation.** The constraint is the source of truth; the lock keeps the common
    case from ever reaching it.
12. **PostgreSQL, not a document store.** Overlap safety is expressed as a
    database constraint, which is not available in the same form elsewhere.
13. **Hand-written CSS instead of a utility framework.** The UI needs a small set
    of layouts; one readable stylesheet is easier to defend in a walkthrough.
14. **`PUT` and `PATCH` are both accepted** on update routes and behave
    identically (partial update). The brief names both; supporting both avoids a
    pointless 404 during review.
15. **`DELETE /api/bookings/:id` cancels rather than deletes**, matching the
    brief's endpoint table while keeping the audit trail. `POST
    /api/bookings/:id/cancel` is provided as the explicit alternative and is what
    the UI uses.

**Not done / known gaps**

16. **The live URL is filled in after the first Vercel deploy** — see *Deployment*
    for Neon + Render + Vercel. `docker compose up` remains the one-command local
    path for reviewers who have Docker.
17. **No end-to-end browser test** (Playwright/Cypress). The booking flow is
    covered by API integration tests plus component tests, but the click-through
    path is verified manually.
18. **No structured/JSON logging** — the server logs through `console` and relies
    on the platform's log capture. `/api/health` exists for the pipeline and
    container health checks.
19. **No refresh-token rotation.** Sessions simply expire after 8 hours and the
    user logs in again.

---

## Deployment (free: Neon + Render + Vercel)

Click-by-click production guide with copy-paste env values:
[`docs/deploy-render.md`](docs/deploy-render.md).

Vercel hosts the React app. It cannot host PostgreSQL or a long-running Express
process, so the free split that matches the brief is:

| Piece | Free host | Why |
| ----- | --------- | --- |
| Database | [Neon](https://neon.tech) | PostgreSQL 16, including `btree_gist` for the overlap constraint |
| API | [Render](https://render.com) | Runs `backend/` 24/7 on the free web tier |
| Web UI | [Vercel](https://vercel.com) | Vite static build |

Push the repo to GitHub first (needed by both Render and Vercel).

### 1. Neon — create the database

1. Open https://neon.tech and click **Sign up** (GitHub login is fastest).
2. Click **New Project**.
3. Name: `deskspot`. Region: pick the closest (e.g. Frankfurt / Frankfurt am Main).
4. Click **Create project**.
5. On the project dashboard, open **Connection details**.
6. Copy the connection string. It looks like:

   `postgresql://neondb_owner:xxxx@ep-xxxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`

7. Keep this tab open.

### 2. Render — deploy the API

1. Open https://render.com and sign up with GitHub.
2. Click **New + → Web Service**.
3. Connect the GitHub account if asked, then select the **Deskspot** repository.
4. Fill in:
   - **Name:** `deskspot-api`
   - **Language / Runtime:** Node
   - **Root Directory:** `backend`
   - **Build Command:** `npm ci && npx prisma generate`
   - **Start Command:** `npx prisma migrate deploy && node prisma/seed.js && node src/server.js`
   - **Instance type:** Free
5. Under **Environment Variables**, add:

   | Key | Value |
   | --- | ----- |
   | `NODE_ENV` | `production` |
   | `HOST` | `0.0.0.0` |
   | `DATABASE_URL` | the Neon string from step 1 |
   | `JWT_SECRET` | a long random string (32+ characters) |
   | `JWT_EXPIRES_IN` | `8h` |
   | `ADMIN_INVITE_CODE` | a secret code of your choosing — needed to register an administrator |
   | `FRONTEND_ORIGIN` | leave as `http://localhost:5173` for now; you will replace it with the Vercel URL in step 4 |

   Do **not** set `EXPOSE_RESET_TOKEN` here: in production the reset token must be
   delivered by email, not returned in the API response.

6. Click **Deploy Web Service**. Wait until the log shows
   `DeskSpot API listening`.
7. Copy the service URL, e.g. `https://deskspot-api.onrender.com`.
8. Open `https://deskspot-api.onrender.com/api/health` — you should see `"status":"ok"`.
9. Free Render services sleep after 15 minutes idle. The first request after
   sleep can take ~50 seconds. That is expected.

If migrate fails with `btree_gist` / `extension`, in the Neon SQL Editor run:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

then **Manual Deploy → Deploy latest commit** on Render.

### 3. Vercel — deploy the UI

1. Open https://vercel.com and sign up with GitHub.
2. Click **Add New… → Project**.
3. Import the **Deskspot** repository.
4. Set:
   - **Framework Preset:** Vite
   - **Root Directory:** click Edit → choose `frontend` → Continue
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. **Environment Variables** → add:

   | Name | Value |
   | ---- | ----- |
   | `VITE_API_URL` | `https://deskspot-api.onrender.com` (no trailing slash) |

6. Click **Deploy**. Wait for the green success screen.
7. Copy the production URL, e.g. `https://deskspot-xxxxx.vercel.app`.

### 4. Point the API at the live UI

1. Back on Render → your web service → **Environment**.
2. Edit `FRONTEND_ORIGIN` to the Vercel URL from step 3 (no trailing slash),
   e.g. `https://deskspot-xxxxx.vercel.app`.
3. Save. Render redeploys automatically.
4. Open the Vercel URL. Sign in with `admin@deskspot.test` / `Admin123!`.

If login fails, wait for Render to finish the restart, then hard-refresh the
Vercel tab (Ctrl+F5). `VITE_API_URL` is baked in at **build** time — if you
change it later, trigger **Redeploy** on Vercel.

**Live URL:** https://deskspot-deploy.vercel.app/

> **Deploy note:** Vercel must set `VITE_API_URL` to the Render API origin (no
> trailing slash) and **redeploy**. Backend secrets (`JWT_SECRET`,
> `DATABASE_URL`, `FRONTEND_ORIGIN`) belong on **Render**, not Vercel. Set
> Render `FRONTEND_ORIGIN=https://deskspot-deploy.vercel.app`.

- CI: `.github/workflows/ci.yml` runs lint, migrations, seed, tests and both image
  builds on every push and pull request (see *Continuous integration*).

---

## Continuous integration

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs three jobs on every
push and pull request:

- **backend** — spins up PostgreSQL 16, `npm ci`, `prisma migrate deploy`,
  `npm run prisma:seed`, `npm run lint`, `npm test -- --coverage` (unit **and**
  integration), uploads the coverage report, then runs `npm audit` as a
  non-blocking vulnerability scan.
- **frontend** — `npm ci`, lint, component tests, production build, plus a
  non-blocking `npm audit`.
- **docker** — validates `docker-compose.yml` and builds both images, so a broken
  Dockerfile fails the pipeline rather than the reviewer's machine.

---

## Documentation

- [Architecture Decision Records](docs/adr)
  - [0001 — Stack choice](docs/adr/0001-stack-choice.md)
  - [0002 — Preventing double bookings](docs/adr/0002-preventing-double-bookings.md)
  - [0003 — Storing and displaying time across offices](docs/adr/0003-time-and-time-zone-handling.md)
- [Story board and status](docs/backlog.md)

### Layout

```
backend/
  prisma/            schema, hand-written SQL migrations, idempotent seed
  src/
    controllers/     thin HTTP layer (parse → call service → serialise)
    services/        transactions and queries (booking, availability, insights)
    domain/          pure business rules, constants, serialisers — no I/O
    lib/             timezone maths, errors, pagination, Prisma client
    middleware/      auth/authorize, error handler, 404 handler
    validation/      zod schemas for every request
    docs/            OpenAPI 3 document and the Swagger UI page
  test/unit/         booking rules and timezone helpers
  test/integration/  API tests against real PostgreSQL
frontend/
  src/
    pages/           login, dashboard, search, my bookings, admin screens
    components/      alerts, badges, form fields, empty and loading states
    services/        one module per API area, shared fetch wrapper
    context/         auth provider (session bootstrap, login, logout)
    utils/           date helpers mirroring the server's slot model
docs/adr/            architecture decision records
```

---

## What I would do next

1. **Email delivery** behind the notification / password-reset seam (Resend or
   SMTP). Keep in-app `Notification` rows; stop using `EXPOSE_RESET_TOKEN` in prod.
2. **Playwright E2E** of portal → book → cancel, wired into CI.
3. **Redis-backed availability hub** so SSE fans out across multiple API
   instances.
4. **Refresh-token rotation** and a shorter access-token lifetime.
5. **A spatial desk-map** for admin occupancy (beyond the current floor tiles).
6. **DB-level room buffer** via a stored buffered `tsrange` if multi-writer races
   on the 15-minute gap become a concern (application locks already cover the
   common case).
