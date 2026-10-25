import jwt from "jsonwebtoken";
import { config } from "../config.js";
import prisma from "../lib/prisma.js";
import { forbidden, unauthorized } from "../lib/errors.js";

function extractToken(req) {
  const cookieToken = req.cookies?.[config.cookieName];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/** Attach req.user when a valid, non-expired token is present. */
export async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized();

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized("Session expired or invalid. Please sign in again.");
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, fullName: true, role: true },
    });
    if (!user) throw unauthorized("Your account is no longer available.");

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/** Role gate. Must run after `authenticate`. */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(
        forbidden(
          "ROLE_REQUIRED",
          "This action requires the " + roles.join(" or ") + " role.",
          { requiredRoles: roles },
        ),
      );
    }
    next();
  };
}
