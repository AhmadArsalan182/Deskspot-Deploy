import { apiRequest } from "./api.js";

/**
 * Register a new account. `role` is the portal the visitor picked; creating an
 * administrator additionally requires the office invite code.
 */
export function register({ fullName, email, password, role, adminInviteCode }) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: { fullName, email, password, role, adminInviteCode },
  });
}

/**
 * Sign in. `portalRole` tells the API which entrance was used so an employee
 * account can never open the administrator area (and the other way round).
 */
export function login({ email, password, portalRole }) {
  return apiRequest("/auth/login", { method: "POST", body: { email, password, portalRole } });
}

export function logout() {
  return apiRequest("/auth/logout", { method: "POST" });
}

export function getSession() {
  return apiRequest("/auth/session");
}

/** Ask for a password-reset link. The reply is the same for unknown emails. */
export function forgotPassword({ email }) {
  return apiRequest("/auth/forgot-password", { method: "POST", body: { email } });
}

/** Complete a password reset with the one-time token. */
export function resetPassword({ token, password }) {
  return apiRequest("/auth/reset-password", { method: "POST", body: { token, password } });
}
