import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { isProduction } from "../config.js";

function isOverlapConstraintError(error) {
  const message = String(error?.message ?? "");
  return message.includes("bookings_no_overlap") || error?.code === "23P01";
}

/** Map known database errors onto HTTP responses. */
function translatePrismaError(error) {
  switch (error?.code) {
    case "P2002":
      return new AppError(409, "DUPLICATE", "A record with those details already exists.");
    case "P2003":
      return new AppError(409, "IN_USE", "This record is still referenced by other data.");
    case "P2025":
      return new AppError(404, "NOT_FOUND", "Resource not found.");
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export function errorHandler(error, req, res, next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Some fields are invalid.",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  if (error instanceof AppError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }

  if (isOverlapConstraintError(error)) {
    return res.status(409).json({
      error: { code: "BOOKING_CONFLICT", message: "This space is already booked for part of that time." },
    });
  }

  const translated = translatePrismaError(error);
  if (translated) {
    return res.status(translated.status).json({
      error: { code: translated.code, message: translated.message },
    });
  }

  if (!isProduction) console.error(error);

  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route matches ${req.method} ${req.originalUrl}.` },
  });
}
