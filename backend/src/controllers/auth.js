import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { config, isProduction } from "../config.js";
import { badRequest, conflict, forbidden, locked, unauthorized } from "../lib/errors.js";
import {
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  RESET_TOKEN_MINUTES,
  afterFailedAttempt,
  clearedLockState,
  isLockedOut,
  lockedMinutesRemaining,
  roleMatchesPortal,
} from "../domain/authPolicy.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../validation/schemas.js";

const BCRYPT_ROUNDS = 10;

/** A dummy hash used so a missing account costs the same time as a wrong password. */
const DUMMY_HASH = "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";

const PORTAL_LABEL = { EMPLOYEE: "Employee", ADMIN: "Administrator" };

function publicUser(user) {
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  };
}

function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, cookieOptions());
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function register(req, res) {
  const { email, password, fullName, role, adminInviteCode } = registerSchema.parse(req.body);

  // Public sign-up can only create employees. Creating an administrator needs
  // the shared invite code, so a visitor cannot promote themselves.
  if (role === "ADMIN" && adminInviteCode !== config.adminInviteCode) {
    throw forbidden(
      "ADMIN_INVITE_REQUIRED",
      "Administrator accounts need a valid invite code. Ask the workplace team for one.",
    );
  }

  const normalizedEmail = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw conflict("EMAIL_TAKEN", "An account with this email already exists.");

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash, fullName, role },
  });

  res.status(201).json({ user: publicUser(user) });
}

export async function login(req, res) {
  const { email, password, portalRole } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (user && isLockedOut(user)) {
    throw locked(
      `This account is locked for ${lockedMinutesRemaining(user)} more minute(s) after ${MAX_FAILED_LOGIN_ATTEMPTS} failed sign-in attempts. Reset your password to unlock it.`,
      { minutesRemaining: lockedMinutesRemaining(user) },
    );
  }

  // Always compare against something so timing does not reveal whether the email exists.
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !matches) {
    if (user) {
      const next = afterFailedAttempt(user);
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: next.failedLoginAttempts, lockedUntil: next.lockedUntil },
      });
      if (next.locked) {
        throw locked(
          `Too many failed sign-in attempts. This account is locked for ${LOCKOUT_MINUTES} minutes — reset your password to unlock it now.`,
          { minutesRemaining: LOCKOUT_MINUTES, attemptsRemaining: 0 },
        );
      }
      throw unauthorized("Invalid email or password.", {
        attemptsRemaining: Math.max(0, MAX_FAILED_LOGIN_ATTEMPTS - next.failedLoginAttempts),
      });
    }
    throw unauthorized("Invalid email or password.");
  }

  // The visitor picked a portal before signing in; the account must match it so
  // an employee never lands in the admin area (or the other way round).
  if (!roleMatchesPortal(user.role, portalRole)) {
    throw forbidden(
      "ROLE_MISMATCH",
      `This account belongs to the ${PORTAL_LABEL[user.role]} portal. Switch to ${PORTAL_LABEL[user.role]} and try again.`,
      { actualRole: user.role, requestedRole: portalRole },
    );
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: clearedLockState() });
  }

  const token = issueToken(user);
  setSessionCookie(res, token);
  res.json({ user: publicUser(user), token, expiresIn: config.jwtExpiresIn });
}

/**
 * Start a password reset. The response is identical whether or not the email is
 * registered, so this endpoint cannot be used to enumerate accounts.
 *
 * There is no mail transport in this project. In non-production the one-time
 * token is returned in the body (and logged) so the flow can be completed; in
 * production `EXPOSE_RESET_TOKEN` stays false and the token would be emailed.
 */
export async function forgotPassword(req, res) {
  const { email } = forgotPasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  let resetToken;
  let expiresAt;

  if (user) {
    const token = randomBytes(32).toString("base64url");
    expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60000);

    await prisma.$transaction([
      // Any earlier link stops working the moment a new one is requested.
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
      }),
    ]);

    if (config.exposeResetToken) {
      resetToken = token;
      console.log(`[auth] password reset token for ${user.email}: ${token}`);
    }
  }

  res.json({
    ok: true,
    message: "If that email is registered, a password reset link has been sent.",
    ...(resetToken ? { resetToken, expiresAt: expiresAt.toISOString() } : {}),
  });
}

export async function resetPassword(req, res) {
  const { token, password } = resetPasswordSchema.parse(req.body);
  const tokenHash = hashToken(token);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  // Same response for "unknown", "already used" and "expired" so a probe cannot
  // tell valid links apart. Use a constant-time compare to avoid leaking timing.
  const storedMatches =
    record && record.tokenHash.length === tokenHash.length
      ? timingSafeEqual(Buffer.from(record.tokenHash), Buffer.from(tokenHash))
      : false;
  if (!record || !storedMatches || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw badRequest(
      "RESET_TOKEN_INVALID",
      "This password reset link is invalid or has expired. Request a new one.",
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, ...clearedLockState() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  res.json({ ok: true, email: record.user.email, message: "Password updated. You can sign in now." });
}

export function logout(req, res) {
  res.clearCookie(config.cookieName, cookieOptions());
  res.json({ ok: true });
}

export function session(req, res) {
  res.json({ user: req.user });
}
