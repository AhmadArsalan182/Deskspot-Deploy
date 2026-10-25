import "dotenv/config";

const INSECURE_DEV_SECRET = "dev-only-insecure-secret-change-me";

function readJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production" && (!secret || secret === INSECURE_DEV_SECRET)) {
    throw new Error("JWT_SECRET must be set to a strong value in production.");
  }
  return secret || INSECURE_DEV_SECRET;
}

function parseOrigins(value) {
  return String(value || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT) || 4000,
  jwtSecret: readJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  frontendOrigins: parseOrigins(process.env.FRONTEND_ORIGIN),
  cookieName: "deskspot_token",
  // Admins are never created through the public sign-up form unless the caller
  // also supplies this shared invite code. Change it per environment.
  adminInviteCode: process.env.ADMIN_INVITE_CODE || "DESKSPOT-ADMIN",
  // When no mail transport is configured the reset token is returned in the
  // response so a reviewer can complete the flow locally. Production must wire
  // a real email sender and leave this false.
  exposeResetToken: String(process.env.EXPOSE_RESET_TOKEN ?? "").toLowerCase() === "true"
    || (process.env.NODE_ENV || "development") !== "production",
};

export const isProduction = config.nodeEnv === "production";
