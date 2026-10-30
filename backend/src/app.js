import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import { config } from "./config.js";
import { openApiDocument, renderDocsPage } from "./docs/openapi.js";
import { authenticate, authorize } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

import * as authController from "./controllers/auth.js";
import * as officeController from "./controllers/offices.js";
import * as spaceController from "./controllers/spaces.js";
import * as availabilityController from "./controllers/availability.js";
import * as bookingController from "./controllers/bookings.js";
import * as adminController from "./controllers/admin.js";
import * as notificationController from "./controllers/notifications.js";

const ADMIN = "ADMIN";

/** Every limiter answers with the same error envelope as the rest of the API. */
function limiterBody(code, message) {
  return { error: { code, message } };
}

export function createApp(options = {}) {
  const app = express();
  // Rate limiting is disabled under test so a suite that deliberately hammers
  // the credential endpoints is not throttled by its own abuse protection.
  const isTest = config.nodeEnv === "test";
  // Explicit overrides win; otherwise use the parsed FRONTEND_ORIGIN allowlist.
  const allowedOrigins = Array.isArray(options.frontendOrigins)
    ? options.frontendOrigins
    : options.frontendOrigin != null
      ? [String(options.frontendOrigin).replace(/\/$/, "")].filter(Boolean)
      : config.frontendOrigins;

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({
    // SSE streams need to stay open; default CORP is fine for our API.
  }));
  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (curl, health checks, same-origin) send no Origin.
        if (!origin) return callback(null, true);
        const normalized = origin.replace(/\/$/, "");
        if (allowedOrigins.includes(normalized)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  // Lightweight structured request log (method, path, status, duration, request id).
  app.use((req, res, next) => {
    const requestId = req.headers["x-request-id"] || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    const started = Date.now();
    res.on("finish", () => {
      if (req.path === "/api/health") return;
      console.log(
        JSON.stringify({
          level: "info",
          msg: "request",
          requestId,
          method: req.method,
          path: req.originalUrl?.split("?")[0] ?? req.path,
          status: res.statusCode,
          durationMs: Date.now() - started,
        }),
      );
    });
    next();
  });

  // Broad safety net so no single client can hammer the API. Health checks are
  // exempt so container/pipeline probes never trip it.
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isTest || req.path === "/health",
    message: limiterBody("RATE_LIMITED", "Too many requests. Please slow down."),
  });
  app.use("/api", apiLimiter);

  // Credential endpoints get a much tighter budget. Combined with the per-account
  // lockout in the auth controller this covers both single-IP and distributed
  // brute-force attempts.
  const credentialLimiter = (max, windowMinutes, message) =>
    rateLimit({
      windowMs: windowMinutes * 60 * 1000,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => isTest,
      message: limiterBody("RATE_LIMITED", message),
    });

  const loginLimiter = credentialLimiter(
    10,
    15,
    "Too many sign-in attempts from this address. Please try again in a few minutes.",
  );
  const registerLimiter = credentialLimiter(
    10,
    60,
    "Too many accounts created from this address. Please try again later.",
  );
  const resetLimiter = credentialLimiter(
    5,
    15,
    "Too many password reset requests. Please check your inbox before trying again.",
  );

  // --- Meta -----------------------------------------------------------------
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
  });
  app.get("/api/openapi.json", (req, res) => res.json(openApiDocument));
  app.get("/api/docs", (req, res) => res.type("html").send(renderDocsPage()));

  // --- Auth -----------------------------------------------------------------
  app.post("/api/auth/register", registerLimiter, authController.register);
  app.post("/api/auth/login", loginLimiter, authController.login);
  app.post("/api/auth/logout", authController.logout);
  app.post("/api/auth/forgot-password", resetLimiter, authController.forgotPassword);
  app.post("/api/auth/reset-password", resetLimiter, authController.resetPassword);
  app.get("/api/auth/session", authenticate, authController.session);

  // --- Offices --------------------------------------------------------------
  app.get("/api/offices", authenticate, officeController.listOffices);
  app.get("/api/offices/:id", authenticate, officeController.getOffice);
  app.get("/api/offices/:id/spaces", authenticate, spaceController.listSpacesForOffice);
  app.post("/api/offices", authenticate, authorize(ADMIN), officeController.createOffice);
  app.put("/api/offices/:id", authenticate, authorize(ADMIN), officeController.updateOffice);
  app.patch("/api/offices/:id", authenticate, authorize(ADMIN), officeController.updateOffice);
  app.delete("/api/offices/:id", authenticate, authorize(ADMIN), officeController.deleteOffice);

  // --- Spaces ---------------------------------------------------------------
  app.get("/api/spaces", authenticate, spaceController.listSpaces);
  app.post("/api/spaces", authenticate, authorize(ADMIN), spaceController.createSpace);
  app.put("/api/spaces/:id", authenticate, authorize(ADMIN), spaceController.updateSpace);
  app.patch("/api/spaces/:id", authenticate, authorize(ADMIN), spaceController.updateSpace);
  app.delete("/api/spaces/:id", authenticate, authorize(ADMIN), spaceController.deleteSpace);

  // --- Availability ---------------------------------------------------------
  app.get("/api/availability", authenticate, availabilityController.searchAvailability);
  app.get("/api/availability/stream", authenticate, availabilityController.streamAvailability);

  // --- Bookings -------------------------------------------------------------
  app.get("/api/bookings/me", authenticate, bookingController.listMyBookingsHandler);
  app.post("/api/bookings/recurring", authenticate, bookingController.createRecurringBooking);
  app.post("/api/bookings", authenticate, bookingController.createBooking);
  app.get("/api/bookings", authenticate, authorize(ADMIN), bookingController.listAllBookings);
  app.post("/api/bookings/:id/cancel", authenticate, bookingController.cancelBooking);
  app.delete("/api/bookings/:id", authenticate, bookingController.cancelBooking);

  // --- Admin ----------------------------------------------------------------
  app.get("/api/admin/overview", authenticate, authorize(ADMIN), adminController.overview);
  app.get("/api/admin/occupancy", authenticate, authorize(ADMIN), adminController.occupancy);
  app.get("/api/admin/statistics", authenticate, authorize(ADMIN), adminController.statistics);

  // --- Notifications --------------------------------------------------------
  app.get("/api/notifications", authenticate, notificationController.listNotifications);
  app.post("/api/notifications/read-all", authenticate, notificationController.markAllRead);
  app.post("/api/notifications/:id/read", authenticate, notificationController.markRead);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
