import { apiRequest, query } from "./api.js";

/** The signed-in employee's own bookings. */
export function getMyBookings({ scope, page, pageSize } = {}) {
  return apiRequest(`/bookings/me${query({ scope, page, pageSize })}`);
}

export function createBooking(data) {
  return apiRequest("/bookings", { method: "POST", body: data });
}

/** Recurring series; returns per-date success/failure. */
export function createRecurringBooking(data) {
  return apiRequest("/bookings/recurring", { method: "POST", body: data });
}

/** Cancel a booking. Admins must pass a reason. */
export function cancelBooking(id, reason) {
  return apiRequest(`/bookings/${id}/cancel`, { method: "POST", body: { reason } });
}
