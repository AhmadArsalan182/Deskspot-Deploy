/**
 * Hand-written OpenAPI 3.0 description for the DeskSpot API.
 * Served at /api/openapi.json, with a rendered view at /api/docs.
 */

const bookingSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["ACTIVE", "CANCELLED"] },
    attendees: { type: "integer" },
    startUtc: { type: "string", format: "date-time" },
    endUtc: { type: "string", format: "date-time" },
    date: { type: "string", description: "Office-local calendar day (YYYY-MM-DD)." },
    localStartTime: { type: "string", description: "Office-local start time (HH:mm)." },
    localEndTime: { type: "string", description: "Office-local end time (HH:mm)." },
    space: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        type: { type: "string", enum: ["DESK", "ROOM"] },
        capacity: { type: "integer" },
      },
    },
    office: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        city: { type: "string" },
        timezone: { type: "string" },
      },
    },
    user: {
      type: "object",
      properties: {
        id: { type: "string" },
        fullName: { type: "string" },
        email: { type: "string" },
      },
    },
    cancelReason: { type: "string", nullable: true },
  },
};

const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: { type: "array", items: { type: "object" } },
      },
      required: ["code", "message"],
    },
  },
};

function errorResponse(description) {
  return { description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
}

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "DeskSpot API",
    version: "1.0.0",
    description:
      "Desk and meeting-room booking API. All instants are ISO-8601 in UTC; office-local wall clock is returned alongside them.",
  },
  servers: [{ url: "/api" }],
  tags: [
    { name: "Auth" },
    { name: "Offices" },
    { name: "Spaces" },
    { name: "Availability" },
    { name: "Bookings" },
    { name: "Admin" },
    { name: "Notifications" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      cookieAuth: { type: "apiKey", in: "cookie", name: "deskspot_token" },
    },
    schemas: { Booking: bookingSchema, Error: errorSchema },
  },
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["Auth"],
        summary: "Health check",
        security: [],
        responses: { 200: { description: "Service is up." } },
      },
    },
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register an employee or administrator account",
        description:
          "The `role` must match the portal the visitor chose. Administrator accounts additionally require the shared invite code.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "fullName"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  fullName: { type: "string" },
                  role: { type: "string", enum: ["EMPLOYEE", "ADMIN"], default: "EMPLOYEE" },
                  adminInviteCode: { type: "string", description: "Required when `role` is ADMIN." },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Created." },
          400: errorResponse("Validation error."),
          403: errorResponse("`ADMIN_INVITE_REQUIRED` — the administrator invite code is wrong."),
          409: errorResponse("Email already registered."),
          429: errorResponse("Too many registration attempts from this address."),
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in and receive a JWT",
        description:
          "When `portalRole` is supplied the account role must match it. Three failed attempts lock the account for 15 minutes; the 401 body carries `details.attemptsRemaining` until then.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                  portalRole: { type: "string", enum: ["EMPLOYEE", "ADMIN"] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Authenticated. Sets an httpOnly cookie and returns a bearer token." },
          401: errorResponse("Invalid credentials, with `details.attemptsRemaining`."),
          403: errorResponse("`ROLE_MISMATCH` — this account belongs to the other portal."),
          423: errorResponse("`ACCOUNT_LOCKED` — too many failed attempts; use the reset flow."),
          429: errorResponse("Too many attempts from this address."),
        },
      },
    },
    "/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a single-use password-reset token",
        description:
          "Always answers with the same generic message so it cannot be used to probe which emails exist. The token is emailed in production and returned inline only when `EXPOSE_RESET_TOKEN` is on.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: { email: { type: "string", format: "email" } },
              },
            },
          },
        },
        responses: {
          200: { description: "Generic confirmation; may include `resetToken` in non-production." },
          429: errorResponse("Too many reset requests from this address."),
        },
      },
    },
    "/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Complete a password reset",
        description: "Consumes the token, sets the new password and clears any lockout.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token", "password"],
                properties: {
                  token: { type: "string" },
                  password: { type: "string", minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Password updated." },
          400: errorResponse("`RESET_TOKEN_INVALID` — the token is unknown, used or expired."),
          429: errorResponse("Too many reset attempts from this address."),
        },
      },
    },
    "/auth/logout": {
      post: { tags: ["Auth"], summary: "Log out", responses: { 200: { description: "Logged out." } } },
    },
    "/auth/session": {
      get: { tags: ["Auth"], summary: "Current session", responses: { 200: { description: "Current user." }, 401: errorResponse("Not authenticated.") } },
    },
    "/offices": {
      get: { tags: ["Offices"], summary: "List offices", responses: { 200: { description: "Offices." } } },
      post: {
        tags: ["Offices"],
        summary: "Create an office (admin)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "city", "timezone"],
                properties: {
                  name: { type: "string" },
                  city: { type: "string" },
                  timezone: { type: "string", example: "Asia/Karachi" },
                },
              },
            },
          },
        },
        responses: { 201: { description: "Created." }, 400: errorResponse("Validation error."), 403: errorResponse("Admin only.") },
      },
    },
    "/offices/{id}": {
      get: { tags: ["Offices"], summary: "Get an office", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Office." }, 404: errorResponse("Not found.") } },
      put: { tags: ["Offices"], summary: "Update an office (admin)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Updated." }, 403: errorResponse("Admin only.") } },
      delete: { tags: ["Offices"], summary: "Delete an empty office (admin)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 204: { description: "Deleted." }, 409: errorResponse("Office still has spaces.") } },
    },
    "/offices/{id}/spaces": {
      get: {
        tags: ["Spaces"],
        summary: "List spaces in an office",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string", enum: ["DESK", "ROOM"] } },
        ],
        responses: { 200: { description: "Spaces." } },
      },
    },
    "/spaces": {
      get: {
        tags: ["Spaces"],
        summary: "List spaces",
        parameters: [
          { name: "officeId", in: "query", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string", enum: ["DESK", "ROOM"] } },
          { name: "includeInactive", in: "query", schema: { type: "boolean" } },
        ],
        responses: { 200: { description: "Spaces." } },
      },
      post: { tags: ["Spaces"], summary: "Create a space (admin)", responses: { 201: { description: "Created." }, 403: errorResponse("Admin only.") } },
    },
    "/spaces/{id}": {
      put: { tags: ["Spaces"], summary: "Update a space (admin)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Updated." }, 403: errorResponse("Admin only.") } },
      delete: { tags: ["Spaces"], summary: "Delete an unbooked space (admin)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 204: { description: "Deleted." }, 409: errorResponse("Space has bookings; deactivate instead.") } },
    },
    "/availability/stream": {
      get: {
        tags: ["Availability"],
        summary: "SSE stream of availability changes for an office and date",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        parameters: [
          { name: "officeId", in: "query", required: true, schema: { type: "string" } },
          { name: "date", in: "query", required: true, schema: { type: "string", format: "date" } },
        ],
        responses: { 200: { description: "text/event-stream (use Authorization Bearer)" } },
      },
    },
    "/availability": {
      get: {
        tags: ["Availability"],
        summary: "Find free spaces for a local time window",
        parameters: [
          { name: "officeId", in: "query", required: true, schema: { type: "string" } },
          { name: "date", in: "query", required: true, schema: { type: "string" }, description: "Office-local day (YYYY-MM-DD)." },
          { name: "from", in: "query", schema: { type: "string" }, description: "Office-local start (HH:mm). Default 08:00." },
          { name: "to", in: "query", schema: { type: "string" }, description: "Office-local end (HH:mm). Default 20:00." },
          { name: "type", in: "query", schema: { type: "string", enum: ["DESK", "ROOM"] } },
        ],
        responses: { 200: { description: "Spaces with an `available` flag and the day's busy intervals." }, 400: errorResponse("Validation error.") },
      },
    },
    "/bookings/recurring": {
      post: {
        tags: ["Bookings"],
        summary: "Create a recurring series (partial success per date)",
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["spaceId", "from", "to", "startDate", "weekdays"],
                properties: {
                  spaceId: { type: "string" },
                  from: { type: "string", example: "09:00" },
                  to: { type: "string", example: "10:00" },
                  startDate: { type: "string", format: "date" },
                  endDate: { type: "string", format: "date" },
                  count: { type: "integer", minimum: 1, maximum: 14 },
                  weekdays: {
                    type: "array",
                    items: { type: "integer", minimum: 1, maximum: 7 },
                    description: "ISO weekdays: 1=Mon … 7=Sun",
                  },
                  attendees: { type: "integer", minimum: 1 },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Per-date results" } },
      },
    },
    "/bookings": {
      post: {
        tags: ["Bookings"],
        summary: "Create a booking",
        description: "Send either startUtc+endUtc (ISO instants) or date+from+to (office-local).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["spaceId"],
                properties: {
                  spaceId: { type: "string" },
                  attendees: { type: "integer", default: 1 },
                  startUtc: { type: "string", format: "date-time" },
                  endUtc: { type: "string", format: "date-time" },
                  date: { type: "string" },
                  from: { type: "string" },
                  to: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Created.", content: { "application/json": { schema: { $ref: "#/components/schemas/Booking" } } } },
          400: errorResponse("A business rule was violated (slot alignment, office hours, limits, capacity)."),
          409: errorResponse("The space is already booked for that window."),
        },
      },
      get: { tags: ["Bookings"], summary: "List all bookings (admin)", responses: { 200: { description: "Paginated bookings." }, 403: errorResponse("Admin only.") } },
    },
    "/bookings/me": {
      get: {
        tags: ["Bookings"],
        summary: "List my bookings",
        parameters: [
          { name: "scope", in: "query", schema: { type: "string", enum: ["all", "upcoming", "past"] } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: { 200: { description: "Paginated bookings." } },
      },
    },
    "/bookings/{id}": {
      delete: {
        tags: ["Bookings"],
        summary: "Cancel a booking (owner or admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { type: "object", properties: { reason: { type: "string" } } } } },
        },
        responses: {
          200: { description: "Cancelled." },
          400: errorResponse("Booking already started, or admin reason missing."),
          404: errorResponse("Booking not found or not yours."),
        },
      },
    },
    "/bookings/{id}/cancel": {
      post: { tags: ["Bookings"], summary: "Cancel a booking (alias of DELETE)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Cancelled." } } },
    },
    "/admin/overview": {
      get: {
        tags: ["Admin"],
        summary: "Everything the administrator dashboard renders",
        description:
          "One round trip for the landing dashboard: headline totals, a per-day trend, occupancy per office, the desk/room split, the busiest spaces and the next 24 hours. Company-wide trend buckets are UTC so offices in different zones share one axis.",
        parameters: [
          { name: "days", in: "query", schema: { type: "integer", minimum: 7, maximum: 90, default: 14 } },
        ],
        responses: { 200: { description: "Dashboard payload." }, 403: errorResponse("Admin only.") },
      },
    },
    "/admin/occupancy": {
      get: {
        tags: ["Admin"],
        summary: "Daily occupancy for one office",
        parameters: [
          { name: "officeId", in: "query", required: true, schema: { type: "string" } },
          { name: "date", in: "query", schema: { type: "string" } },
        ],
        responses: { 200: { description: "Spaces with their bookings for the day." }, 403: errorResponse("Admin only.") },
      },
    },
    "/admin/statistics": {
      get: {
        tags: ["Admin"],
        summary: "Occupancy percentage per office",
        parameters: [{ name: "days", in: "query", schema: { type: "integer", default: 7 } }],
        responses: { 200: { description: "Per-office occupancy." }, 403: errorResponse("Admin only.") },
      },
    },
    "/notifications": {
      get: { tags: ["Notifications"], summary: "List my notifications", responses: { 200: { description: "Notifications with unread count." } } },
    },
    "/notifications/read-all": {
      post: { tags: ["Notifications"], summary: "Mark all notifications as read", responses: { 200: { description: "OK." } } },
    },
  },
};

export function renderDocsPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DeskSpot API docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.ui = SwaggerUIBundle({ url: "/api/openapi.json", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`;
}
