import prisma from "../lib/prisma.js";
import { badRequest, notFound } from "../lib/errors.js";
import {
  cancelBooking as cancelBookingService,
  createBooking as createBookingService,
  createRecurringBookings as createRecurringBookingsService,
  listBookingsForAdmin,
  listMyBookings,
} from "../services/bookingService.js";
import { localDateTimeToUtc } from "../lib/timezone.js";
import {
  allBookingsQuerySchema,
  bookingCreateSchema,
  cancelBookingSchema,
  myBookingsQuerySchema,
  recurringBookingSchema,
} from "../validation/schemas.js";

/** Accept either absolute instants or an office-local date + from/to pair. */
async function resolveWindow(input) {
  if (input.startUtc && input.endUtc) {
    return { startUtc: input.startUtc, endUtc: input.endUtc };
  }

  const space = await prisma.space.findUnique({
    where: { id: input.spaceId },
    include: { office: true },
  });
  if (!space) throw notFound("Space not found.");

  const startUtc = localDateTimeToUtc(input.date, input.from, space.office.timezone);
  const endUtc = localDateTimeToUtc(input.date, input.to, space.office.timezone);
  if (!startUtc || !endUtc) {
    throw badRequest("INVALID_DATE", "date must be YYYY-MM-DD and from/to must be HH:mm.");
  }
  return { startUtc, endUtc };
}

export async function createBooking(req, res) {
  const input = bookingCreateSchema.parse(req.body);
  const { startUtc, endUtc } = await resolveWindow(input);

  const booking = await createBookingService({
    actor: req.user,
    spaceId: input.spaceId,
    startUtc,
    endUtc,
    attendees: input.attendees,
  });

  res.status(201).json(booking);
}

export async function createRecurringBooking(req, res) {
  const input = recurringBookingSchema.parse(req.body);
  const result = await createRecurringBookingsService({
    actor: req.user,
    spaceId: input.spaceId,
    from: input.from,
    to: input.to,
    attendees: input.attendees,
    startDate: input.startDate,
    endDate: input.endDate,
    count: input.count,
    weekdays: input.weekdays,
  });
  res.status(200).json(result);
}

export async function listMyBookingsHandler(req, res) {
  const query = myBookingsQuerySchema.parse(req.query);
  const result = await listMyBookings({
    actor: req.user,
    scope: query.scope ?? "all",
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  });
  res.json(result);
}

export async function cancelBooking(req, res) {
  const { reason } = cancelBookingSchema.parse(req.body ?? {});
  const booking = await cancelBookingService({
    actor: req.user,
    bookingId: req.params.id,
    reason: reason ?? req.query.reason,
  });
  res.json(booking);
}

export async function listAllBookings(req, res) {
  const query = allBookingsQuerySchema.parse(req.query);
  const result = await listBookingsForAdmin({
    officeId: query.officeId,
    date: query.date,
    status: query.status,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  });
  res.json(result);
}
