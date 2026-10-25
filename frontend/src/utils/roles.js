export const ROLES = { EMPLOYEE: "EMPLOYEE", ADMIN: "ADMIN" };

/**
 * The two entrances to DeskSpot. A visitor picks one before signing in, and the
 * API enforces that an account may only use its own entrance.
 */
export const PORTALS = {
  EMPLOYEE: {
    role: ROLES.EMPLOYEE,
    label: "Employee",
    title: "Employee portal",
    blurb: "Find a free desk or meeting room and manage your own bookings.",
  },
  ADMIN: {
    role: ROLES.ADMIN,
    label: "Administrator",
    title: "Administrator portal",
    blurb: "Manage offices and spaces, and watch occupancy across the company.",
  },
};

/** Where a signed-in user lands. Admins get their dashboard, employees theirs. */
export function homePathFor(role) {
  return role === ROLES.ADMIN ? "/admin" : "/dashboard";
}

export function isPortal(value) {
  return value === ROLES.EMPLOYEE || value === ROLES.ADMIN;
}

/** Read `?portal=` from a query string or URLSearchParams, or null when absent. */
export function portalFromSearch(search) {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const portal = params?.get?.("portal");
  return isPortal(portal) ? portal : null;
}
