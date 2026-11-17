// A short-lived cache for GET /api/signals responses, with request coalescing.
//
// Why: NOAA publishes hourly values, and every load of the page asks NOAA for the same
// window. Without a cache, each visitor's load is one NOAA request. With it, one NOAA
// request serves every load of the same station, product, and window for the TTL.
//
// What is cached: only successful, normalized NOAA responses. Errors are never cached,
// so a failed upstream call is retried by the next request. Nothing is changed by the
// cache: the cached value is the same body the scientific pipeline produced.
//
// Timestamps: a cached body keeps its original source.retrievedAt, which is when this
// server asked NOAA. The route adds a `cache` object that states when the entry was
// stored and when it expires. Cache metadata is not part of the body that a save copies,
// so a saved copy never records that it came from the cache.
//
// Bounds: the key is station, product, and window. The allowlist has one station and one
// product and windows of 1 to 72 hours, so there are at most 72 keys, and the cache holds
// at most maxEntries. Concurrent identical requests share one NOAA call (coalescing).

export const SIGNAL_CACHE_TTL_MS = 5 * 60 * 1000;
export const SIGNAL_CACHE_MAX_ENTRIES = 100;

export function createSignalCache({
  ttlMs = SIGNAL_CACHE_TTL_MS,
  maxEntries = SIGNAL_CACHE_MAX_ENTRIES,
  now = () => Date.now(),
} = {}) {
  // key -> { value, storedAtMs, expiresAtMs }. Map keeps insertion order, so the first key
  // is the oldest entry, and it is the one dropped at capacity.
  const entries = new Map();
  // key -> Promise for a NOAA request already in progress.
  const inFlight = new Map();

  function sweep(time) {
    for (const [key, entry] of entries) {
      if (entry.expiresAtMs <= time) entries.delete(key);
    }
    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value);
    }
  }

  return {
    ttlMs,
    // Returns the live entry, or null when there is none or it has expired.
    get(key) {
      const time = now();
      sweep(time);
      const entry = entries.get(key);
      return entry ? { ...entry } : null;
    },
    set(key, value) {
      const time = now();
      entries.delete(key);
      entries.set(key, { value, storedAtMs: time, expiresAtMs: time + ttlMs });
      sweep(time);
    },
    forget(key) {
      entries.delete(key);
    },
    // Runs `load` once for all callers that ask for the same key while it is in progress.
    // Resolves with { value, shared } where shared is true when this caller joined a
    // request that another caller started.
    coalesce(key, load) {
      const pending = inFlight.get(key);
      if (pending) return pending.then((value) => ({ value, shared: true }));
      const promise = Promise.resolve()
        .then(load)
        .finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      return promise.then((value) => ({ value, shared: false }));
    },
    size() {
      sweep(now());
      return entries.size;
    },
    inFlightCount() {
      return inFlight.size;
    },
  };
}
