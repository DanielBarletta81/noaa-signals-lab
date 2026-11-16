// Short-lived, in-memory record of recent successful NOAA retrievals.
//
// The save action saves what the server itself retrieved and normalized, identified
// by a retrieval ID. The browser never sends observation data back to be stored, so a
// client cannot save data that NOAA did not return.
//
// Retention, in the three ways a retrieval can stop being available:
//   1. Expiry: each retrieval is kept for RETRIEVAL_TTL_MS (30 minutes) after it was made.
//   2. Capacity: at most RETRIEVAL_LIMIT are held. The oldest is dropped first. The store
//      is shared by every visitor, so a busy server can drop a retrieval within minutes.
//   3. Restart: the store lives in process memory and is empty after any restart.
// In each case a save returns 404 retrieval_not_found, and the browser offers a fresh
// load. Saved snapshots are in SQLite and are not affected by any of these.
//
// A retrieval ID is a random, unguessable string. It is not authorization. Anyone who
// holds an ID can save that retrieval once, and no one can read other copies through it.

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
  // id -> { value, createdAt, savedSnapshotId }. Map keeps insertion order, so the first
  // key is the oldest entry and is the one dropped at capacity.
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
      entries.set(id, { value, createdAt: now(), savedSnapshotId: null });
      prune();
      return id;
    },
    get(id) {
      prune();
      const entry = entries.get(id);
      return entry ? entry.value : null;
    },
    // The snapshot this retrieval was saved as, or null. Lets a repeated save of the
    // same retrieval return the existing copy instead of writing a second one.
    savedSnapshotId(id) {
      prune();
      const entry = entries.get(id);
      return entry ? entry.savedSnapshotId : null;
    },
    recordSave(id, snapshotId) {
      prune();
      const entry = entries.get(id);
      if (entry) entry.savedSnapshotId = snapshotId;
    },
    size() {
      prune();
      return entries.size;
    },
  };
}

export const defaultRetrievalStore = createRetrievalStore();
