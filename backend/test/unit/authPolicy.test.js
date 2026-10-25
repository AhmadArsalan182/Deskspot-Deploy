import { describe, expect, it } from "vitest";
import {
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  afterFailedAttempt,
  clearedLockState,
  isLockedOut,
  lockedMinutesRemaining,
  roleMatchesPortal,
} from "../../src/domain/authPolicy.js";

const NOW = new Date("2026-05-01T10:00:00.000Z");

describe("isLockedOut", () => {
  it("treats a missing lock as unlocked", () => {
    expect(isLockedOut({ failedLoginAttempts: 2, lockedUntil: null }, NOW)).toBe(false);
    expect(isLockedOut(null, NOW)).toBe(false);
  });

  it("is locked while `lockedUntil` is in the future", () => {
    const lockedUntil = new Date(NOW.getTime() + 60_000);
    expect(isLockedOut({ lockedUntil }, NOW)).toBe(true);
  });

  it("releases the account once the lock expires", () => {
    const lockedUntil = new Date(NOW.getTime() - 1);
    expect(isLockedOut({ lockedUntil }, NOW)).toBe(false);
  });

  it("does not treat an exactly-now lock as still locked", () => {
    expect(isLockedOut({ lockedUntil: new Date(NOW) }, NOW)).toBe(false);
  });
});

describe("afterFailedAttempt", () => {
  it("counts up without locking below the threshold", () => {
    const first = afterFailedAttempt({ failedLoginAttempts: 0 }, NOW);
    expect(first).toEqual({ failedLoginAttempts: 1, lockedUntil: null, locked: false });

    const second = afterFailedAttempt({ failedLoginAttempts: 1 }, NOW);
    expect(second.failedLoginAttempts).toBe(2);
    expect(second.locked).toBe(false);
    expect(second.lockedUntil).toBeNull();
  });

  it("locks the account on the third failure for the full window", () => {
    const third = afterFailedAttempt({ failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1 }, NOW);
    expect(third.locked).toBe(true);
    expect(third.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(third.lockedUntil.getTime()).toBe(NOW.getTime() + LOCKOUT_MINUTES * 60_000);
  });

  it("treats a missing counter as zero", () => {
    expect(afterFailedAttempt(undefined, NOW).failedLoginAttempts).toBe(1);
  });

  it("produces a state that is immediately locked out", () => {
    const state = afterFailedAttempt({ failedLoginAttempts: 2 }, NOW);
    expect(isLockedOut(state, NOW)).toBe(true);
  });
});

describe("lockedMinutesRemaining", () => {
  it("is zero when the account is not locked", () => {
    expect(lockedMinutesRemaining({ lockedUntil: null }, NOW)).toBe(0);
  });

  it("rounds a partial minute up, so the message never says 0 minutes", () => {
    const lockedUntil = new Date(NOW.getTime() + 30_000);
    expect(lockedMinutesRemaining({ lockedUntil }, NOW)).toBe(1);
  });

  it("reports the full window right after locking", () => {
    const state = afterFailedAttempt({ failedLoginAttempts: 2 }, NOW);
    expect(lockedMinutesRemaining(state, NOW)).toBe(LOCKOUT_MINUTES);
  });
});

describe("clearedLockState", () => {
  it("wipes both the counter and the lock", () => {
    expect(clearedLockState()).toEqual({ failedLoginAttempts: 0, lockedUntil: null });
  });

  it("leaves the account unlocked", () => {
    expect(isLockedOut(clearedLockState(), NOW)).toBe(false);
  });
});

describe("roleMatchesPortal", () => {
  it("allows any role when no portal was chosen (older clients)", () => {
    expect(roleMatchesPortal("ADMIN", undefined)).toBe(true);
    expect(roleMatchesPortal("EMPLOYEE", null)).toBe(true);
  });

  it("accepts the matching portal", () => {
    expect(roleMatchesPortal("EMPLOYEE", "EMPLOYEE")).toBe(true);
    expect(roleMatchesPortal("ADMIN", "ADMIN")).toBe(true);
  });

  it("rejects the other portal, so the entrances stay separate", () => {
    expect(roleMatchesPortal("ADMIN", "EMPLOYEE")).toBe(false);
    expect(roleMatchesPortal("EMPLOYEE", "ADMIN")).toBe(false);
  });
});
