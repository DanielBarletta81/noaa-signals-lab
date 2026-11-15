// Short-lived, in-memory record of recent successful NOAA retrievals.
//
// The save action saves what the server itself retrieved and normalized, identified
// by a retrieval ID. The browser never sends observation data back to be stored, so a
// client cannot save data that NOAA did not return. The store is bounded (a fixed
// number of entries and a time limit) and is lost when the process restarts. Saved
// snapshots are stored in SQLite; retrievals are not.

import { randomUUID } from "node:crypto";

export const RETRIEVAL_LIMIT = 20;
export const RETRIEVAL_TTL_MS = 30 * 60 * 1000;

// A version-4 UUID as produced by randomUUID(). Anything else is rejected before lookup.
export const RETRIEVAL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createRetrievalStore({
  limit = RETRIEVAL_LIMIT,
  ttlMs = RETRIEVAL_TTL_MS,
  now = () => Date.now(),
  idFactory = randomUUID,
} = {}) {
  const entries = new Map();

  function prune() {
    const cutoff = now() - ttlMs;
    for (const [id, entry] of entries) {
      if (entry.createdAt < cutoff) entries.delete(id);
    }
    while (entries.size > limit) {
      entries.delete(entries.keys().next().value);
    }
  }

  return {
    put(value) {
      const id = idFactory();
      entries.set(id, { value, createdAt: now() });
      prune();
      return id;
    },
    get(id) {
      prune();
      const entry = entries.get(id);
      return entry ? entry.value : null;
    },
    size() {
      prune();
      return entries.size;
    },
  };
}

export const defaultRetrievalStore = createRetrievalStore();
