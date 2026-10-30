import { z } from "zod";
import { findAvailableSpaces } from "../services/availabilityService.js";
import { subscribeAvailability } from "../services/availabilityHub.js";
import { availabilityQuerySchema } from "../validation/schemas.js";

const streamQuerySchema = z.object({
  officeId: z.string().min(1, "officeId is required."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date in YYYY-MM-DD format."),
});

export async function searchAvailability(req, res) {
  const query = availabilityQuerySchema.parse(req.query);
  const result = await findAvailableSpaces({
    ...query,
    // Employees only need to know that a slot is taken, not who took it or the
    // internal id — that keeps other people's bookings out of reach.
    includeBookingIds: req.user.role === "ADMIN",
  });
  res.json(result);
}

/** Server-Sent Events: clients refetch availability when this office/date changes. */
export async function streamAvailability(req, res) {
  const query = streamQuerySchema.parse(req.query);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  res.write(`event: ready\ndata: ${JSON.stringify({ officeId: query.officeId, date: query.date })}\n\n`);

  const unsubscribe = subscribeAvailability(query.officeId, query.date, res);
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(heartbeat);
      unsubscribe();
    }
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  req.on("close", cleanup);
  req.on("aborted", cleanup);
}
