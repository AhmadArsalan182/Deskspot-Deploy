/**
 * In-process pub/sub for availability SSE streams.
 * Single-node only (Render free web service / Docker). Multi-instance would
 * need Redis or similar; documented as a known stretch limitation.
 */

const subscribers = new Map(); // key → Set<ServerResponse>

function channelKey(officeId, date) {
  return `${officeId}:${date}`;
}

export function subscribeAvailability(officeId, date, res) {
  const key = channelKey(officeId, date);
  let set = subscribers.get(key);
  if (!set) {
    set = new Set();
    subscribers.set(key, set);
  }
  set.add(res);

  return () => {
    set.delete(res);
    if (set.size === 0) subscribers.delete(key);
  };
}

export function publishAvailabilityChange(officeId, date, reason = "booking.changed") {
  const key = channelKey(officeId, date);
  const set = subscribers.get(key);
  if (!set || set.size === 0) return;

  const payload = `event: availability.changed\ndata: ${JSON.stringify({ officeId, date, reason })}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      set.delete(res);
    }
  }
}

/** Test helper. */
export function _resetAvailabilityHub() {
  subscribers.clear();
}
