/** Business-rule constants for DeskSpot. See README "Assumptions" for the reasoning. */

/** Bookings are made in 30-minute slots. */
export const SLOT_MINUTES = 30;

/** Office hours, in the office's local time. */
export const OFFICE_OPEN_HOUR = 8;
export const OFFICE_CLOSE_HOUR = 20;

/** Employees may book at most this many calendar days ahead (inclusive of today). */
export const MAX_ADVANCE_DAYS = 14;

/** An employee may hold at most this many ACTIVE desk bookings per office-local day. */
export const MAX_ACTIVE_DESK_BOOKINGS_PER_DAY = 2;

/** Default page size for paginated list endpoints. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
