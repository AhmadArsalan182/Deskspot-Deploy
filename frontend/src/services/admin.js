import { apiRequest, query } from "./api.js";

/** Headline numbers plus chart-ready series for the admin landing dashboard. */
export function getOverview({ days } = {}) {
  return apiRequest(`/admin/overview${query({ days })}`);
}

/** Every booking across all offices (admins only). */
export function getAllBookings({ officeId, date, status, page, pageSize } = {}) {
  return apiRequest(`/bookings${query({ officeId, date, status, page, pageSize })}`);
}

/** Per-office view of all bookings for one date (admins only). */
export function getOccupancy({ officeId, date }) {
  return apiRequest(`/admin/occupancy${query({ officeId, date })}`);
}

/** Occupancy percentage per office over the last `days` days (admins only). */
export function getStatistics({ days } = {}) {
  return apiRequest(`/admin/statistics${query({ days })}`);
}
