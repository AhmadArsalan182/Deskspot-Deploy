import { apiRequest, query } from "./api.js";

/** Free-space search for one office, date and time window. */
export function searchAvailability({ officeId, date, from, to, type }) {
  return apiRequest(`/availability${query({ officeId, date, from, to, type })}`);
}
