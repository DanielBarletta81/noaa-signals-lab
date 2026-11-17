// GET /api/signals: the short-lived cache, request coalescing, and the per-connection limit.
// NOAA is mocked, and every NOAA call is counted. Time is injected, so expiry is exact.

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock } from "node:test";
import { NOAA_DATAGETTER_URL } from "../src/adapters/noaaClient.js";
import { createRetrievalStore } from "../src/retrievals/store.js";
import { createSignalCache, SIGNAL_CACHE_TTL_MS } from "../src/signals/signalCache.js";
import { startTestApp } from "./helpers/httpApp.js";

const GMT_24 = JSON.parse(
  readFileSync(new URL("./fixtures/noaa-8454000-water_temperature-gmt-24h.json", import.meta.url), "utf8")
);
const realFetch = globalThis.fetch;
const LIVE = "/api/signals?station=8454000&product=water_temperature&range=24";

let app;
let noaaCalls;
let clock;

// Routes NOAA-bound calls to the responder; local requests reach the real server.
function mockNoaa(responder) {
  noaaCalls = [];
  mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith(NOAA_DATAGETTER_URL)) {
      noaaCalls.push(String(url));
      return responder(options);
    }
    return realFetch(url, options);
  });
}

const okNoaa = () => ({ ok: true, status: 200, json: async () => GMT_24 });

async function startWith({ limit } = {}) {
  clock = Date.parse("2026-11-16T00:00:00.000Z");
  const now = () => clock;
  app = await startTestApp({
    retrievals: createRetrievalStore({ now }),
    signalOptions: {
      cache: createSignalCache({ now }),
      rateLimit: { ...(limit ?? { limit: 1000, windowMs: 60_000 }), now },
    },
  });
  return app;
}

afterEach(async () => {
  mock.restoreAll();
  if (app) await app.close();
  app = null;
});

describe("the cache: a repeat load within the lifetime does not ask NOAA again", () => {
  it("serves the second load from the cache, with the same retrieval and the original NOAA time", async () => {
    await startWith();
    mockNoaa(okNoaa);

    const first = await app.request(LIVE);
    const second = await app.request(LIVE);

    assert.equal(first.body.cache.status, "miss");
    assert.equal(second.body.cache.status, "hit");
    assert.equal(noaaCalls.length, 1, "NOAA is asked once");
    assert.equal(second.body.retrievalId, first.body.retrievalId);
    assert.equal(second.body.source.retrievedAt, first.body.source.retrievedAt);
    assert.equal(second.body.cache.fetchedAt, first.body.source.retrievedAt);
  });

  it("states when the entry was stored and when it expires, five minutes apart", async () => {
    await startWith();
    mockNoaa(okNoaa);
    const res = await app.request(LIVE);
    const stored = Date.parse(res.body.cache.storedAt);
    const expires = Date.parse(res.body.cache.expiresAt);
    assert.equal(expires - stored, SIGNAL_CACHE_TTL_MS);
    assert.equal(res.body.cache.maxAgeSeconds, 300);
  });

  it("returns a body that matches a fresh one, apart from the delivery metadata", async () => {
    await startWith();
    mockNoaa(okNoaa);
    const fresh = await app.request(LIVE);
    const cached = await app.request(LIVE);
    const strip = ({ retrievalId: _r, cache: _c, ...rest }) => rest;
    assert.deepEqual(strip(cached.body), strip(fresh.body));
  });

  it("asks NOAA again once the lifetime has passed, and gives a new retrieval", async () => {
    await startWith();
    mockNoaa(okNoaa);
    const first = await app.request(LIVE);
    clock += SIGNAL_CACHE_TTL_MS + 1;
    const later = await app.request(LIVE);
    assert.equal(later.body.cache.status, "miss");
    assert.equal(noaaCalls.length, 2);
    assert.notEqual(later.body.retrievalId, first.body.retrievalId);
  });

  it("does not reuse a cached retrieval that the save store has already dropped", async () => {
    clock = Date.parse("2026-11-16T00:00:00.000Z");
    const now = () => clock;
    // Room for one retrieval only: a second load pushes the first out of the save store.
    app = await startTestApp({
      retrievals: createRetrievalStore({ limit: 1, now }),
      signalOptions: { cache: createSignalCache({ now }), rateLimit: { limit: 1000, windowMs: 60_000 } },
    });
    mockNoaa(okNoaa);
    const first = await app.request(LIVE);
    app.retrievals.put({ body: {}, points: [] }); // evicts the first retrieval
    const again = await app.request(LIVE);
    assert.equal(again.body.cache.status, "miss", "the dropped retrieval must not be handed out again");
    assert.equal(noaaCalls.length, 2);
    assert.notEqual(again.body.retrievalId, first.body.retrievalId);
    assert.equal(app.retrievals.get(again.body.retrievalId) !== null, true, "the new ID is saveable");
  });

  it("does not cache an error: the next load asks NOAA again and can succeed", async () => {
    await startWith();
    let attempt = 0;
    mockNoaa(() => {
      attempt += 1;
      return attempt === 1
        ? { ok: false, status: 500, json: async () => ({}) }
        : okNoaa();
    });
    const failed = await app.request(LIVE);
    const recovered = await app.request(LIVE);
    assert.equal(failed.status, 502);
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.cache.status, "miss");
    assert.equal(noaaCalls.length, 2);
  });
});

describe("coalescing: identical requests that overlap share one NOAA call", () => {
  it("sends one NOAA request for three simultaneous identical loads", async () => {
    await startWith();
    mockNoaa(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return okNoaa();
    });
    const results = await Promise.all([app.request(LIVE), app.request(LIVE), app.request(LIVE)]);
    assert.equal(noaaCalls.length, 1);
    const statuses = results.map((r) => r.body.cache.status).sort();
    assert.deepEqual(statuses, ["miss", "shared", "shared"]);
    const ids = new Set(results.map((r) => r.body.retrievalId));
    assert.equal(ids.size, 1, "every waiter receives the same retrieval");
  });

  it("gives every waiter the same error when the shared NOAA request fails", async () => {
    await startWith();
    mockNoaa(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { ok: false, status: 503, json: async () => ({}) };
    });
    const results = await Promise.all([app.request(LIVE), app.request(LIVE)]);
    assert.equal(noaaCalls.length, 1);
    assert.deepEqual(results.map((r) => r.status), [502, 502]);
  });
});

describe("the per-connection limit on GET /api/signals", () => {
  it("counts cache hits, so a cached response cannot be used to bypass the limit", async () => {
    await startWith({ limit: { limit: 2, windowMs: 60_000 } });
    mockNoaa(okNoaa);
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await app.request(LIVE)).status);
    assert.deepEqual(statuses, [200, 200, 429]);
    assert.equal(noaaCalls.length, 1, "the refused request never reached NOAA or the cache");
  });

  it("answers 429 rate_limited with Retry-After, and never a stack trace", async () => {
    await startWith({ limit: { limit: 1, windowMs: 60_000 } });
    mockNoaa(okNoaa);
    await app.request(LIVE);
    const refused = await app.request(LIVE);
    assert.equal(refused.status, 429);
    assert.equal(refused.body.code, "rate_limited");
    const retry = Number(refused.headers.get("retry-after"));
    assert.equal(Number.isInteger(retry) && retry >= 1 && retry <= 60, true);
    assert.equal(/\n\s+at /.test(refused.text), false);
  });

  it("allows the window to reset", async () => {
    await startWith({ limit: { limit: 1, windowMs: 60_000 } });
    mockNoaa(okNoaa);
    await app.request(LIVE);
    assert.equal((await app.request(LIVE)).status, 429);
    clock += 60_000;
    assert.equal((await app.request(LIVE)).status, 200);
  });
});

describe("cache-control on the observation response", () => {
  it("is no-store, so no browser or intermediary keeps a retrieval ID", async () => {
    await startWith();
    mockNoaa(okNoaa);
    const res = await app.request(LIVE);
    assert.equal(res.headers.get("cache-control"), "no-store");
  });
});

describe("the cache bounds itself", () => {
  it("holds no more than its maximum number of entries, dropping the oldest first", () => {
    let t = 0;
    const cache = createSignalCache({ maxEntries: 2, now: () => t });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    assert.equal(cache.get("a"), null);
    assert.equal(cache.get("b").value, 2);
    assert.equal(cache.get("c").value, 3);
    assert.equal(cache.size(), 2);
  });

  it("forgets an entry when its lifetime has passed", () => {
    let t = 0;
    const cache = createSignalCache({ ttlMs: 1000, now: () => t });
    cache.set("a", 1);
    t = 1000;
    assert.equal(cache.get("a"), null);
  });
});
