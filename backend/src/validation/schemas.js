import { z } from "zod";
import { isValidTimeZone } from "../lib/timezone.js";
import { MAX_PAGE_SIZE } from "../domain/constants.js";

const timeZone = z.string().refine(isValidTimeZone, {
  message: "Must be a valid IANA time zone, e.g. Europe/Copenhagen.",
});

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date in YYYY-MM-DD format.");
const clockTime = z.string().regex(/^\d{2}:\d{2}$/, "Must be a time in HH:mm format.");

/** An ISO-8601 instant that must carry an explicit offset so it is unambiguous. */
const instant = z
  .string()
  .refine(
    (value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)),
    "Must be an ISO-8601 instant with a time zone offset, e.g. 2026-05-01T10:00:00Z.",
  )
  .transform((value) => new Date(value));

const portalRole = z.enum(["EMPLOYEE", "ADMIN"]);

export const registerSchema = z
  .object({
    email: z.string().email("Enter a valid email address."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(200, "Password is too long."),
    fullName: z.string().trim().min(2, "Enter your full name."),
    role: portalRole.default("EMPLOYEE"),
    // Only consulted when `role` is ADMIN, so public sign-up cannot mint admins.
    adminInviteCode: z.string().optional(),
  })
  .strip();

export const loginSchema = z
  .object({
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(1, "Enter your password."),
    // The portal the visitor picked. When present the account role must match it.
    portalRole: portalRole.optional(),
  })
  .strip();

export const forgotPasswordSchema = z
  .object({
    email: z.string().email("Enter a valid email address."),
  })
  .strip();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, "The reset link is invalid or incomplete."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(200, "Password is too long."),
  })
  .strip();

export const officeCreateSchema = z.object({
  name: z.string().trim().min(2, "Office name is too short."),
  city: z.string().trim().min(2, "City is too short."),
  timezone: timeZone,
});

export const officeUpdateSchema = officeCreateSchema.partial();

export const spaceCreateSchema = z.object({
  name: z.string().trim().min(1, "Space name is required."),
  type: z.enum(["DESK", "ROOM"]),
  capacity: z.number().int().min(1).max(500).default(1),
  isActive: z.boolean().default(true),
  officeId: z.string().min(1, "officeId is required."),
});

export const spaceUpdateSchema = spaceCreateSchema.partial();

export const bookingCreateSchema = z
  .object({
    spaceId: z.string().min(1, "spaceId is required."),
    attendees: z.number().int().min(1).max(500).default(1),
    startUtc: instant.optional(),
    endUtc: instant.optional(),
    date: dayKey.optional(),
    from: clockTime.optional(),
    to: clockTime.optional(),
  })
  .refine((value) => (value.startUtc && value.endUtc) || (value.date && value.from && value.to), {
    message: "Provide either startUtc and endUtc, or date with from and to.",
  });

/** Recurring series: office-local date + from/to, weekdays 1=Mon … 7=Sun. */
export const recurringBookingSchema = z
  .object({
    spaceId: z.string().min(1, "spaceId is required."),
    attendees: z.number().int().min(1).max(500).default(1),
    from: clockTime,
    to: clockTime,
    startDate: dayKey,
    endDate: dayKey.optional(),
    count: z.number().int().min(1).max(14).optional(),
    weekdays: z.array(z.number().int().min(1).max(7)).nonempty("Pick at least one weekday."),
  })
  .refine((value) => value.endDate || value.count, {
    message: "Provide endDate or count for the series.",
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: "endDate must be on or after startDate.",
  })
  .refine((value) => value.to > value.from, {
    message: "The end time must be after the start time.",
  });

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const availabilityQuerySchema = z.object({
  officeId: z.string().min(1, "officeId is required."),
  date: dayKey,
  from: clockTime.optional(),
  to: clockTime.optional(),
  type: z.enum(["DESK", "ROOM"]).optional(),
});

export const occupancyQuerySchema = z.object({
  officeId: z.string().min(1, "officeId is required."),
  date: dayKey.optional(),
});

export const statisticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
});

export const overviewQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).optional(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export const myBookingsQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(["all", "upcoming", "past"]).optional(),
});

export const allBookingsQuerySchema = paginationQuerySchema.extend({
  officeId: z.string().min(1).optional(),
  date: dayKey.optional(),
  status: z.enum(["ACTIVE", "CANCELLED"]).optional(),
});

export const spacesQuerySchema = z.object({
  officeId: z.string().min(1).optional(),
  type: z.enum(["DESK", "ROOM"]).optional(),
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
