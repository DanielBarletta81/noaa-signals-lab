// A fixed-window request limiter for write endpoints.
//
// Each key (here, a client address) may make `limit` requests per `windowMs`. When the
// window ends, the count starts again. The number of tracked keys is capped, so a flood
// of distinct addresses cannot grow memory without limit. If the cap is reached with no
// expired windows to free, new keys are refused until a window ends. That fails closed
// for write traffic, which is the safer choice for a shared archive.

export const DEFAULT_WRITE_LIMIT = Object.freeze({ limit: 10, windowMs: 60 * 1000 });
export const MAX_TRACKED_KEYS = 10000;

export function createFixedWindowLimiter({
  limit = DEFAULT_WRITE_LIMIT.limit,
  windowMs = DEFAULT_WRITE_LIMIT.windowMs,
  maxKeys = MAX_TRACKED_KEYS,
  now = () => Date.now(),
} = {}) {
  const windows = new Map(); // key -> { startedAt, count }

  function sweep(time) {
    for (const [key, window] of windows) {
      if (time - window.startedAt >= windowMs) windows.delete(key);
    }
  }

  // Returns { allowed: true } or { allowed: false, retryAfterSeconds }.
  return {
    hit(key) {
      const time = now();
      let window = windows.get(key);

      if (!window || time - window.startedAt >= windowMs) {
        if (!window && windows.size >= maxKeys) sweep(time);
        if (!window && windows.size >= maxKeys) {
          return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
        }
        window = { startedAt: time, count: 0 };
        windows.set(key, window);
      }

      if (window.count >= limit) {
        const remainingMs = window.startedAt + windowMs - time;
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
      }
      window.count += 1;
      return { allowed: true };
    },
    trackedKeys() {
      return windows.size;
    },
  };
}
