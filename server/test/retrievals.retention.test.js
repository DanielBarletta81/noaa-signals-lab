// Unit tests for the retrieval store's retention rules and the write limiter. Time is
// injected, so expiry and window resets are exact and need no waiting.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRetrievalStore, RETRIEVAL_ID_PATTERN, RETRIEVAL_LIMIT, RETRIEVAL_TTL_MS } from "../src/retrievals/store.js";
import { createFixedWindowLimiter, DEFAULT_WRITE_LIMIT } from "../src/http/rateLimit.js";

function clockAt(start = 1_000_000) {
  let time = start;
  return { now: () => time, advance: (ms) => (time += ms) };
}

describe("retrieval retention: expiry", () => {
  it("documents a 30-minute lifetime and a 20-entry bound", () => {
    assert.equal(RETRIEVAL_TTL_MS, 30 * 60 * 1000);
    assert.equal(RETRIEVAL_LIMIT, 20);
  });

  it("keeps a retrieval until its lifetime ends, then forgets it", () => {
    const clock = clockAt();
    const store = createRetrievalStore({ ttlMs: 1000, now: clock.now });
    const id = store.put({ body: "x" });

    clock.advance(999);
    assert.equal(store.get(id)?.body, "x");

    clock.advance(2);
    assert.equal(store.get(id), null);
    assert.equal(store.size(), 0);
  });
});

describe("retrieval retention: capacity", () => {
  it("drops the oldest retrieval first when the bound is reached", () => {
    const store = createRetrievalStore({ limit: 2, now: () => 0 });
    const first = store.put({ n: 1 });
    const second = store.put({ n: 2 });
    const third = store.put({ n: 3 });

    assert.equal(store.get(first), null);
    assert.equal(store.get(second)?.n, 2);
    assert.equal(store.get(third)?.n, 3);
    assert.equal(store.size(), 2);
  });
});

describe("retrieval IDs", () => {
  it("are random version-4 UUIDs, distinct for each retrieval", () => {
    const store = createRetrievalStore();
    const ids = new Set();
    for (let i = 0; i < 50; i += 1) ids.add(store.put({ i }));
    assert.equal(ids.size, 50);
    for (const id of ids) assert.match(id, RETRIEVAL_ID_PATTERN);
  });

  it("are not a permission: the store keeps no owner, so any holder of an ID can save that retrieval", () => {
    const store = createRetrievalStore();
    const id = store.put({ body: "x" });
    // A lookup needs only the ID. There is no user, session, or token to check.
    assert.equal(store.get(id).body, "x");
  });
});

describe("saved-copy record on a retrieval", () => {
  it("remembers which snapshot a retrieval was saved as, so a repeat save can return it", () => {
    const store = createRetrievalStore();
    const id = store.put({ body: "x" });
    assert.equal(store.savedSnapshotId(id), null);
    store.recordSave(id, 7);
    assert.equal(store.savedSnapshotId(id), 7);
  });

  it("forgets that record with the retrieval itself", () => {
    const clock = clockAt();
    const store = createRetrievalStore({ ttlMs: 1000, now: clock.now });
    const id = store.put({ body: "x" });
    store.recordSave(id, 7);
    clock.advance(1001);
    assert.equal(store.savedSnapshotId(id), null);
  });

  it("ignores a record for an unknown retrieval", () => {
    const store = createRetrievalStore();
    store.recordSave("00000000-0000-4000-8000-000000000000", 3);
    assert.equal(store.size(), 0);
  });
});

describe("write limiter", () => {
  it("uses a 10-saves-per-minute default", () => {
    assert.deepEqual(DEFAULT_WRITE_LIMIT, { limit: 10, windowMs: 60000 });
  });

  it("allows the limit within a window, then refuses with the seconds until the window ends", () => {
    const clock = clockAt();
    const limiter = createFixedWindowLimiter({ limit: 2, windowMs: 60_000, now: clock.now });
    assert.deepEqual(limiter.hit("a"), { allowed: true });
    assert.deepEqual(limiter.hit("a"), { allowed: true });

    clock.advance(20_000);
    assert.deepEqual(limiter.hit("a"), { allowed: false, retryAfterSeconds: 40 });
  });

  it("starts a new count when the window ends", () => {
    const clock = clockAt();
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 60_000, now: clock.now });
    assert.equal(limiter.hit("a").allowed, true);
    assert.equal(limiter.hit("a").allowed, false);
    clock.advance(60_000);
    assert.equal(limiter.hit("a").allowed, true);
  });

  it("counts each address separately", () => {
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    assert.equal(limiter.hit("a").allowed, true);
    assert.equal(limiter.hit("b").allowed, true);
    assert.equal(limiter.hit("a").allowed, false);
  });

  it("bounds the number of tracked addresses, and refuses new ones rather than growing without limit", () => {
    const clock = clockAt();
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2, now: clock.now });
    assert.equal(limiter.hit("a").allowed, true);
    assert.equal(limiter.hit("b").allowed, true);
    assert.equal(limiter.trackedKeys(), 2);

    const refused = limiter.hit("c");
    assert.equal(refused.allowed, false);
    assert.equal(limiter.trackedKeys(), 2);

    // Once the windows end, the old addresses are dropped and a new one is admitted.
    clock.advance(60_000);
    assert.equal(limiter.hit("c").allowed, true);
    assert.equal(limiter.trackedKeys(), 1);
  });
});
