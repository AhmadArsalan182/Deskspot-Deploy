import { ApiError, apiRequest, getApiRoot, query } from "./api.js";
import { getStoredToken } from "./sessionToken.js";

/** Free-space search for one office, date and time window. */
export function searchAvailability({ officeId, date, from, to, type }) {
  return apiRequest(`/availability${query({ officeId, date, from, to, type })}`);
}

/**
 * Subscribe to availability changes via fetch + SSE parsing.
 * Uses Authorization Bearer (unlike EventSource) so the JWT never appears in the URL.
 */
export function openAvailabilityStream({ officeId, date, onChange, onError }) {
  if (import.meta.env.PROD && !getApiRoot()) {
    onError?.(new ApiError("API URL is not configured.", { code: "API_URL_MISSING" }));
    return () => {};
  }

  const controller = new AbortController();
  const token = getStoredToken();
  const root = getApiRoot();
  const url = `${root}/api/availability/stream${query({ officeId, date })}`;

  (async () => {
    try {
      const headers = { Accept: "text/event-stream" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(url, {
        headers,
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        onError?.(new ApiError("Availability stream unavailable.", { status: response.status }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n");
        buffer = chunks.pop() ?? "";

        for (const line of chunks) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:") && eventName === "availability.changed") {
            try {
              onChange?.(JSON.parse(line.slice(5).trim()));
            } catch {
              onChange?.({});
            }
            eventName = "message";
          } else if (line === "") {
            eventName = "message";
          }
        }
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      onError?.(error);
    }
  })();

  return () => controller.abort();
}
