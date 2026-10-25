/**
 * Application error with an HTTP status and a stable machine-readable code.
 * Every error response follows the shape:
 *   { error: { code, message, details? } }
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = "Authentication required", details) =>
  new AppError(401, "UNAUTHENTICATED", message, details);
export const forbidden = (code, message, details) => new AppError(403, code, message, details);
export const notFound = (message = "Resource not found") => new AppError(404, "NOT_FOUND", message);
export const conflict = (code, message) => new AppError(409, code, message);
/** 423 Locked — used when an account is temporarily locked after failed logins. */
export const locked = (message, details) => new AppError(423, "ACCOUNT_LOCKED", message, details);
