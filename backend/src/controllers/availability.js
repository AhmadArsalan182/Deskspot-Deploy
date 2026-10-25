import { findAvailableSpaces } from "../services/availabilityService.js";
import { availabilityQuerySchema } from "../validation/schemas.js";

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
