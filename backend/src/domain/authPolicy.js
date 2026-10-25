/**
 * Pure authentication policy — no I/O, so it can be unit tested directly.
 *
 * The API applies these rules on every login attempt; the values are mirrored in
 * the UI only to explain what happened to the user.
 */

/** Consecutive wrong passwords tolerated before the account is locked. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 3;

/** How long an account stays locked once the threshold is reached. */
export const LOCKOUT_MINUTES = 15;

/** How long a password-reset link stays valid. */
export const RESET_TOKEN_MINUTES = 30;

/**
 * Is the account currently locked?
 *
 * A lock expires on its own: once `now` passes `lockedUntil` the user may try
 * again, so an attacker cannot permanently deny access to a real employee.
 */
export function isLockedOut(user, now = new Date()) {
  if (!user?.lockedUntil) return false;
  return user.lockedUntil.getTime() > now.getTime();
}

/** Whole minutes left on the current lock, rounded up, for the error message. */
export function lockedMinutesRemaining(user, now = new Date()) {
  if (!isLockedOut(user, now)) return 0;
  return Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
}

/**
 * State to persist after a failed password check.
 *
 * @returns {{failedLoginAttempts: number, lockedUntil: Date|null, locked: boolean}}
 */
export function afterFailedAttempt(user, now = new Date()) {
  const attempts = (user?.failedLoginAttempts ?? 0) + 1;
  const locked = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
  return {
    failedLoginAttempts: attempts,
    lockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MINUTES * 60000) : null,
    locked,
  };
}

/** State to persist after a successful login or a completed password reset. */
export function clearedLockState() {
  return { failedLoginAttempts: 0, lockedUntil: null };
}

/**
 * Whether an account is allowed to sign in through the portal the visitor
 * selected. Keeps "Employee" and "Admin" entrances from being interchangeable.
 */
export function roleMatchesPortal(userRole, portalRole) {
  if (!portalRole) return true;
  return userRole === portalRole;
}
