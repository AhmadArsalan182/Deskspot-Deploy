/**
 * API integration tests against a real PostgreSQL database.
 *
 * They run only when a test database is configured:
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/deskspot_test
 * (falls back to DATABASE_URL). The schema must already be migrated — the
 * pipeline runs `prisma migrate deploy` first.
 */

import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const JWT_SECRET = "integration-test-secret-integration-test-secret";
const ADMIN_INVITE_CODE = "integration-invite-code";
const HAS_DB = Boolean(databaseUrl);

if (HAS_DB) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.NODE_ENV = "test";
} else {
  // Let the Prisma client construct without a real database; the suite is skipped.
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/deskspot_placeholder?schema=public";
  process.env.JWT_SECRET = JWT_SECRET;
}

// The app reads these once at import time, so they must be set before the
// dynamic import below.
process.env.ADMIN_INVITE_CODE = ADMIN_INVITE_CODE;
process.env.EXPOSE_RESET_TOKEN = "true";

const describeDb = HAS_DB ? describe : describe.skip;

const { createApp } = await import("../../src/app.js");
const { default: prisma } = await import("../../src/lib/prisma.js");
const { addDaysToDayKey, localDayKey, localDateTimeToUtc } = await import("../../src/lib/timezone.js");

const app = createApp({ frontendOrigin: "http://localhost:5173" });

const KARACHI = "Asia/Karachi";

// A day 3 days from now, in the office's local time: inside the 14-day window
// regardless of when the suite runs.
const DAY = addDaysToDayKey(localDayKey(new Date(), KARACHI), 3);
const at = (time) => localDateTimeToUtc(DAY, time, KARACHI).toISOString();

let office;
let desk;
let room;
let admin;
let alice;
let bob;

async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "notifications", "bookings", "spaces", "offices", "users" RESTART IDENTITY CASCADE',
  );
}

beforeAll(async () => {
  if (HAS_DB) await resetDatabase();
});

afterAll(async () => {
  if (HAS_DB) await prisma.$disconnect();
});

beforeEach(async () => {
  if (!HAS_DB) return;
  await resetDatabase();

  office = await prisma.office.create({
    data: { name: "Islamabad HQ", city: "Islamabad", timezone: KARACHI },
  });
  desk = await prisma.space.create({
    data: { name: "Desk A1", type: "DESK", capacity: 1, officeId: office.id },
  });
  room = await prisma.space.create({
    data: { name: "Boardroom", type: "ROOM", capacity: 6, officeId: office.id },
  });

  const hash = await bcrypt.hash("Password123!", 10);
  admin = await prisma.user.create({
    data: { email: "admin@test.dev", passwordHash: hash, fullName: "Admin", role: "ADMIN" },
  });
  alice = await prisma.user.create({
    data: { email: "alice@test.dev", passwordHash: hash, fullName: "Alice", role: "EMPLOYEE" },
  });
  bob = await prisma.user.create({
    data: { email: "bob@test.dev", passwordHash: hash, fullName: "Bob", role: "EMPLOYEE" },
  });
});

function tokenFor(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "1h" });
}

const auth = (user) => ["Authorization", `Bearer ${tokenFor(user)}`];

/** Booking payload using the office-local wall clock. */
function bookingBody({ spaceId = desk.id, day = DAY, from = "10:00", to = "11:00", attendees = 1 } = {}) {
  return { spaceId, date: day, from, to, attendees };
}

function postBooking(user, body = bookingBody()) {
  return request(app).post("/api/bookings").set(...auth(user)).send(body);
}

describeDb("DeskSpot API", () => {
  describe("auth", () => {
    it("registers a new employee and rejects a duplicate email", async () => {
      const first = await request(app)
        .post("/api/auth/register")
        .send({ email: "new@test.dev", password: "Password123!", fullName: "New Person" });
      expect(first.status).toBe(201);
      expect(first.body.user.role).toBe("EMPLOYEE");

      const duplicate = await request(app)
        .post("/api/auth/register")
        .send({ email: "new@test.dev", password: "Password123!", fullName: "New Person" });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe("EMAIL_TAKEN");
    });

    it("logs in with valid credentials and rejects bad ones", async () => {
      const ok = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@test.dev", password: "Password123!" });
      expect(ok.status).toBe(200);
      expect(typeof ok.body.token).toBe("string");

      const bad = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@test.dev", password: "wrong-password" });
      expect(bad.status).toBe(401);
      expect(bad.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects unauthenticated access to protected endpoints", async () => {
      const res = await request(app).get("/api/bookings/me");
      expect(res.status).toBe(401);
    });
  });

  describe("booking rules", () => {
    it("creates a booking on the happy path and stores it as UTC", async () => {
      const res = await postBooking(alice);

      expect(res.status).toBe(201);
      // 10:00 in Karachi (UTC+05:00) is 05:00Z.
      expect(res.body.startUtc).toBe(at("10:00"));
      expect(res.body.localStartTime).toBe("10:00");
      expect(res.body.status).toBe("ACTIVE");

      const row = await prisma.booking.findUnique({ where: { id: res.body.id } });
      expect(row.startUtc.toISOString()).toBe(at("10:00"));
    });

    it("rejects an overlapping booking with 409", async () => {
      await postBooking(alice);
      const clash = await postBooking(bob, bookingBody({ from: "10:30", to: "11:30" }));

      expect(clash.status).toBe(409);
      expect(clash.body.error.code).toBe("BOOKING_CONFLICT");
    });

    it("accepts a booking that touches the previous one's end", async () => {
      await postBooking(alice);
      const next = await postBooking(bob, bookingBody({ from: "11:00", to: "12:00" }));
      expect(next.status).toBe(201);
    });

    it("rejects a booking that is not aligned to 30-minute slots", async () => {
      const res = await postBooking(alice, bookingBody({ from: "10:15", to: "10:45" }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("SLOT_ALIGNMENT");
    });

    it("rejects a booking outside office hours", async () => {
      const res = await postBooking(alice, bookingBody({ from: "19:30", to: "20:30" }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("OUTSIDE_OFFICE_HOURS");
    });

    it("rejects more attendees than the room capacity", async () => {
      const res = await postBooking(alice, bookingBody({ spaceId: room.id, attendees: 8 }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("CAPACITY_EXCEEDED");
    });

    it("rejects the third desk booking for one employee on the same day", async () => {
      const secondDesk = await prisma.space.create({
        data: { name: "Desk A2", type: "DESK", capacity: 1, officeId: office.id },
      });
      const thirdDesk = await prisma.space.create({
        data: { name: "Desk A3", type: "DESK", capacity: 1, officeId: office.id },
      });

      expect((await postBooking(alice, bookingBody({ from: "08:00", to: "09:00" }))).status).toBe(201);
      expect((await postBooking(alice, bookingBody({ spaceId: secondDesk.id, from: "09:00", to: "10:00" }))).status).toBe(201);

      const third = await postBooking(alice, bookingBody({ spaceId: thirdDesk.id, from: "10:00", to: "11:00" }));
      expect(third.status).toBe(400);
      expect(third.body.error.code).toBe("DESK_DAILY_LIMIT");
    });

    it("rejects a booking more than 14 days ahead", async () => {
      const day = addDaysToDayKey(localDayKey(new Date(), KARACHI), 16);
      const res = await postBooking(alice, bookingBody({ day }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("ADVANCE_LIMIT");
    });

    it("lets only one of two simultaneous requests win the slot", async () => {
      const [a, b] = await Promise.all([postBooking(alice), postBooking(bob)]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const count = await prisma.booking.count({ where: { spaceId: desk.id, status: "ACTIVE" } });
      expect(count).toBe(1);
    });
  });

  describe("cancellation and access control", () => {
    async function createBookingFor(user, body = bookingBody()) {
      const res = await postBooking(user, body);
      expect(res.status).toBe(201);
      return res.body;
    }

    it("lets the owner cancel their own future booking", async () => {
      const booking = await createBookingFor(alice);
      const res = await request(app).delete(`/api/bookings/${booking.id}`).set(...auth(alice)).send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
    });

    it("hides another employee's booking (404, no IDOR)", async () => {
      const booking = await createBookingFor(bob);
      const res = await request(app)
        .delete(`/api/bookings/${booking.id}`)
        .set(...auth(alice))
        .send({ reason: "not mine" });
      expect(res.status).toBe(404);

      const stillActive = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(stillActive.status).toBe("ACTIVE");
    });

    it("requires a reason when an admin cancels and notifies the owner", async () => {
      const booking = await createBookingFor(alice);

      const withoutReason = await request(app).delete(`/api/bookings/${booking.id}`).set(...auth(admin)).send({});
      expect(withoutReason.status).toBe(400);
      expect(withoutReason.body.error.code).toBe("CANCEL_REASON_REQUIRED");

      const withReason = await request(app)
        .delete(`/api/bookings/${booking.id}`)
        .set(...auth(admin))
        .send({ reason: "Deep clean of the floor" });
      expect(withReason.status).toBe(200);
      expect(withReason.body.cancelReason).toBe("Deep clean of the floor");

      const notifications = await request(app).get("/api/notifications").set(...auth(alice));
      expect(notifications.body.items[0].type).toBe("BOOKING_CANCELLED_BY_ADMIN");
      expect(notifications.body.items[0].message).toContain("Deep clean of the floor");
    });

    it("rejects cancelling a booking that has already started", async () => {
      const past = await prisma.booking.create({
        data: {
          spaceId: desk.id,
          userId: alice.id,
          startUtc: new Date(Date.now() - 2 * 60 * 60 * 1000),
          endUtc: new Date(Date.now() - 60 * 60 * 1000),
          attendees: 1,
        },
      });
      const res = await request(app).delete(`/api/bookings/${past.id}`).set(...auth(alice)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("BOOKING_ALREADY_STARTED");
    });

    it("blocks employees from admin endpoints", async () => {
      const res = await request(app).get(`/api/admin/occupancy?officeId=${office.id}`).set(...auth(alice));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("ROLE_REQUIRED");
    });
  });

  describe("availability and admin views", () => {
    it("excludes booked spaces from availability", async () => {
      const before = await request(app)
        .get(`/api/availability?officeId=${office.id}&date=${DAY}&from=10:00&to=11:00`)
        .set(...auth(alice));
      expect(before.status).toBe(200);
      expect(before.body.spaces.find((space) => space.id === desk.id).available).toBe(true);

      await postBooking(bob);

      const after = await request(app)
        .get(`/api/availability?officeId=${office.id}&date=${DAY}&from=10:00&to=11:00`)
        .set(...auth(alice));
      const busyDesk = after.body.spaces.find((space) => space.id === desk.id);
      expect(busyDesk.available).toBe(false);
      expect(busyDesk.busy).toHaveLength(1);
    });

    it("returns daily occupancy and 7-day statistics for admins", async () => {
      await postBooking(alice);

      const occupancy = await request(app)
        .get(`/api/admin/occupancy?officeId=${office.id}&date=${DAY}`)
        .set(...auth(admin));
      expect(occupancy.status).toBe(200);
      expect(occupancy.body.totals.bookings).toBe(1);
      expect(occupancy.body.totals.bookedSlots).toBe(2); // one hour = two 30-minute slots

      // F9 reports occupancy for the last 7 days, so seed a booking in the past
      // (the API correctly refuses to create one through POST /api/bookings).
      const pastDay = addDaysToDayKey(localDayKey(new Date(), KARACHI), -2);
      await prisma.booking.create({
        data: {
          spaceId: desk.id,
          userId: alice.id,
          startUtc: localDateTimeToUtc(pastDay, "10:00", KARACHI),
          endUtc: localDateTimeToUtc(pastDay, "11:00", KARACHI),
          attendees: 1,
        },
      });

      const stats = await request(app).get("/api/admin/statistics?days=7").set(...auth(admin));
      expect(stats.status).toBe(200);
      const officeStats = stats.body.offices.find((item) => item.office.id === office.id);
      expect(officeStats).toBeDefined();
      expect(officeStats.bookings).toBe(1);
      expect(officeStats.occupancyPercent).toBeGreaterThan(0);
    });

    it("stores a space name containing markup as plain text", async () => {
      const res = await request(app)
        .post("/api/spaces")
        .set(...auth(admin))
        .send({ name: "<script>alert(1)</script>", type: "DESK", capacity: 1, officeId: office.id });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("<script>alert(1)</script>");
    });

    it("returns the admin dashboard overview and keeps employees out", async () => {
      await postBooking(alice);

      const res = await request(app).get("/api/admin/overview?days=14").set(...auth(admin));
      expect(res.status).toBe(200);
      expect(res.body.windowDays).toBe(14);
      expect(res.body.totals.offices).toBe(1);
      expect(res.body.totals.bookingsInWindow).toBe(1);
      expect(res.body.trend).toHaveLength(14);

      const officeRow = res.body.officeOccupancy.find((row) => row.office.id === office.id);
      expect(officeRow.activeSpaces).toBe(2);
      expect(officeRow.occupancyPercent).toBeGreaterThan(0);

      const forbidden = await request(app).get("/api/admin/overview").set(...auth(alice));
      expect(forbidden.status).toBe(403);
    });

    it("never leaks booking ids to employees through availability", async () => {
      await postBooking(bob);

      const res = await request(app)
        .get(`/api/availability?officeId=${office.id}&date=${DAY}&from=10:00&to=11:00`)
        .set(...auth(alice));

      const busyDesk = res.body.spaces.find((space) => space.id === desk.id);
      expect(busyDesk.busy).toHaveLength(1);
      expect(busyDesk.busy[0]).not.toHaveProperty("id");
      expect(busyDesk.busy[0]).not.toHaveProperty("userId");
    });
  });

  describe("login hardening", () => {
    function login(body) {
      return request(app).post("/api/auth/login").send(body);
    }

    const badLogin = { email: "alice@test.dev", password: "not-the-password" };

    it("counts down the remaining attempts on the first two failures", async () => {
      const first = await login(badLogin);
      expect(first.status).toBe(401);
      expect(first.body.error.details.attemptsRemaining).toBe(2);

      const second = await login(badLogin);
      expect(second.status).toBe(401);
      expect(second.body.error.details.attemptsRemaining).toBe(1);
    });

    it("locks the account on the third failure and keeps the correct password out", async () => {
      await login(badLogin);
      await login(badLogin);

      const third = await login(badLogin);
      expect(third.status).toBe(423);
      expect(third.body.error.code).toBe("ACCOUNT_LOCKED");

      const correct = await login({ email: "alice@test.dev", password: "Password123!" });
      expect(correct.status).toBe(423);
      expect(correct.body.error.code).toBe("ACCOUNT_LOCKED");

      const row = await prisma.user.findUnique({ where: { id: alice.id } });
      expect(row.failedLoginAttempts).toBe(3);
      expect(row.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it("clears the counter after a successful sign-in", async () => {
      await login(badLogin);
      expect((await login({ email: "alice@test.dev", password: "Password123!" })).status).toBe(200);

      const row = await prisma.user.findUnique({ where: { id: alice.id } });
      expect(row.failedLoginAttempts).toBe(0);
      expect(row.lockedUntil).toBeNull();
    });

    it("refuses to sign an account in through the other portal", async () => {
      const mismatch = await login({
        email: "admin@test.dev",
        password: "Password123!",
        portalRole: "EMPLOYEE",
      });
      expect(mismatch.status).toBe(403);
      expect(mismatch.body.error.code).toBe("ROLE_MISMATCH");
      expect(mismatch.body.error.details.actualRole).toBe("ADMIN");

      const matching = await login({
        email: "admin@test.dev",
        password: "Password123!",
        portalRole: "ADMIN",
      });
      expect(matching.status).toBe(200);
    });

    it("does not reveal whether an email exists", async () => {
      const res = await login({ email: "nobody@test.dev", password: "not-the-password" });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe("Invalid email or password.");
      expect(res.body.error.details).toBeUndefined();
    });

    it("keeps administrator sign-up behind the invite code", async () => {
      const withoutCode = await request(app).post("/api/auth/register").send({
        email: "sneaky@test.dev",
        password: "Password123!",
        fullName: "Sneaky",
        role: "ADMIN",
      });
      expect(withoutCode.status).toBe(403);
      expect(withoutCode.body.error.code).toBe("ADMIN_INVITE_REQUIRED");

      const withCode = await request(app).post("/api/auth/register").send({
        email: "boss@test.dev",
        password: "Password123!",
        fullName: "Boss",
        role: "ADMIN",
        adminInviteCode: ADMIN_INVITE_CODE,
      });
      expect(withCode.status).toBe(201);
      expect(withCode.body.user.role).toBe("ADMIN");
    });

    it("registers employees without any invite code", async () => {
      const res = await request(app).post("/api/auth/register").send({
        email: "worker@test.dev",
        password: "Password123!",
        fullName: "Worker",
        role: "EMPLOYEE",
      });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe("EMPLOYEE");
    });
  });

  describe("password reset", () => {
    it("issues a one-time link, unlocks the account and lets the new password in", async () => {
      const badLogin = { email: "alice@test.dev", password: "not-the-password" };
      await request(app).post("/api/auth/login").send(badLogin);
      await request(app).post("/api/auth/login").send(badLogin);
      await request(app).post("/api/auth/login").send(badLogin);

      const requested = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "alice@test.dev" });
      expect(requested.status).toBe(200);
      expect(typeof requested.body.resetToken).toBe("string");

      const reset = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: requested.body.resetToken, password: "BrandNewPass123!" });
      expect(reset.status).toBe(200);

      // The lockout is gone and the old password no longer works.
      const locked = await prisma.user.findUnique({ where: { id: alice.id } });
      expect(locked.lockedUntil).toBeNull();
      expect(locked.failedLoginAttempts).toBe(0);

      const withNew = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@test.dev", password: "BrandNewPass123!" });
      expect(withNew.status).toBe(200);

      const withOld = await request(app)
        .post("/api/auth/login")
        .send({ email: "alice@test.dev", password: "Password123!" });
      expect(withOld.status).toBe(401);
    });

    it("refuses to reuse a spent token", async () => {
      const requested = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "alice@test.dev" });

      const first = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: requested.body.resetToken, password: "BrandNewPass123!" });
      expect(first.status).toBe(200);

      const replay = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: requested.body.resetToken, password: "AnotherPass123!" });
      expect(replay.status).toBe(400);
      expect(replay.body.error.code).toBe("RESET_TOKEN_INVALID");
    });

    it("invalidates an older link when a new one is requested", async () => {
      const first = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "alice@test.dev" });
      const second = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "alice@test.dev" });

      const stale = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: first.body.resetToken, password: "BrandNewPass123!" });
      expect(stale.status).toBe(400);

      const fresh = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: second.body.resetToken, password: "BrandNewPass123!" });
      expect(fresh.status).toBe(200);
    });

    it("answers the same way for an unknown email", async () => {
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "nobody@test.dev" });
      expect(res.status).toBe(200);
      expect(res.body.resetToken).toBeUndefined();
    });

    it("rejects a reset link that was never issued", async () => {
      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: "not-a-real-token", password: "BrandNewPass123!" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("RESET_TOKEN_INVALID");
    });
  });
});
