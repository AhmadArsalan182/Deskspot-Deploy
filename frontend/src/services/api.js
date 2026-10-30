import { ApiError } from "./apiError.js";
import { getStoredToken } from "./sessionToken.js";

export { ApiError };

const API_ROOT = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

if (import.meta.env.PROD && !API_ROOT) {
  // Surfaced once so a misconfigured Vercel deploy fails loudly instead of
  // posting to the SPA origin (which has no /api routes).
  console.error(
    "VITE_API_URL is not set. On Vercel, set it to your Render API origin (no trailing slash) and redeploy.",
  );
}

/** Public API origin used by fetch and EventSource. Empty means same-origin /api. */
export function getApiRoot() {
  return API_ROOT;
}

/**
 * Thin fetch wrapper around the DeskSpot API.
 *
 * Locally and in Docker, requests go to the relative `/api` path (Vite or nginx
 * proxy). On Vercel, set `VITE_API_URL` to the Render API origin; the Bearer
 * token from login is sent so the session survives cross-site cookie blocking.
 */
export async function apiRequest(path, { method = "GET", body, signal } = {}) {
  let response;
  const token = getStoredToken();
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  if (import.meta.env.PROD && !API_ROOT) {
    throw new ApiError(
      "This site is not connected to the API. Set VITE_API_URL on Vercel to your Render URL and redeploy.",
      { code: "API_URL_MISSING" },
    );
  }

  try {
    response = await fetch(`${API_ROOT}/api${path}`, {
      method,
      headers,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("Cannot reach the server. Check your connection and try again.", {
      code: "NETWORK_ERROR",
    });
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(error?.message ?? "Something went wrong. Please try again.", {
      status: response.status,
      code: error?.code,
      details: error?.details,
    });
  }

  return data;
}

/** Build a query string, dropping empty values. */
export function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}
