import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { createApp } from "../src/app.js";
import { createRetrievalStore } from "../src/retrievals/store.js";
import { NOAA_DATAGETTER_URL } from "../src/adapters/noaaClient.js";
import { seedDemoSnapshot } from "../scripts/seed-demo-snapshot.js";
import { GMT_24, openTempDb, SYNTHETIC_PAYLOAD } from "./helpers/snapshotFixtures.js";

const realFetch = globalThis.fetch;
let temp;
let retrievals;
let server;
let baseUrl;

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Routes NOAA-bound calls to the fixture; local test requests reach the real server.
function mockNoaa(payload) {
  mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith(NOAA_DATAGETTER_URL)) return jsonResponse(200, payload);
    return realFetch(url, options);
  });
}

async function call(path, init = {}) {
  const res = await realFetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _nonJson: text.slice(0, 80) };
  }
  return { status: res.status, body, text };
}

const post = (path, payload, extra = {}) =>
  call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extra.headers },
    body: extra.raw ?? JSON.stringify(payload),
  });

before(async () => {
  temp = openTempDb();
  retrievals = createRetrievalStore();
  const app = createApp({ db: temp.db, retrievals });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  temp.cleanup();
});

describe("save, list, and reopen through HTTP", () => {
  it("returns a retrievalId from a successful load, saves it, and reopens the same signal", async (t) => {
    mockNoaa(GMT_24);
    t.after(() => mock.restoreAll());

    const live = await call("/api/signals?station=8454000&product=water_temperature&range=24");
    assert.equal(live.status, 200);
    assert.match(live.body.retrievalId, /^[0-9a-f-]{36}$/);

    const saved = await post("/api/snapshots", { retrievalId: live.body.retrievalId });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.snapshot.sourceMode, "live");
    assert.equal(saved.body.snapshot.demoLabel, null);
    const id = saved.body.snapshot.id;

    const listed = await call("/api/snapshots");
    assert.equal(listed.status, 200);
    assert.equal(listed.body.total >= 1, true);
    assert.equal(listed.body.snapshots.some((s) => s.id === id), true);

    const reopened = await call(`/api/snapshots/${id}`);
    assert.equal(reopened.status, 200);
    // retrievalId and cache describe this delivery, not the observations. A saved copy keeps
    // the observations only.
    const { retrievalId: _omitted, cache: _cache, ...liveSignal } = live.body;
    assert.deepEqual(reopened.body.signal, liveSignal);
    assert.equal(reopened.body.snapshot.retrievedAt, live.body.source.retrievedAt);
  });

  it("does not save a retrieval a second time as a different one, and reports a missing retrieval", async (t) => {
    mockNoaa(SYNTHETIC_PAYLOAD);
    t.after(() => mock.restoreAll());
    const live = await call("/api/signals?station=8454000&product=water_temperature&range=24");
    const unknown = await post("/api/snapshots", { retrievalId: "00000000-0000-4000-8000-000000000000" });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.code, "retrieval_not_found");
    assert.equal(live.status, 200);
  });
});

describe("invalid requests and unknown IDs", () => {
  it("rejects a save body that is not an object", async () => {
    const res = await post("/api/snapshots", ["x"]);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "invalid_parameter");
  });

  it("rejects extra fields, including any attempt to supply observations or a path", async () => {
    const res = await post("/api/snapshots", { retrievalId: "00000000-0000-4000-8000-000000000000", path: "/tmp/x.sqlite" });
    assert.equal(res.status, 400);
    assert.equal(res.body.details.errors[0].field, "path");
  });

  it("rejects a malformed retrieval ID before any lookup", async () => {
    for (const retrievalId of ["", "../../etc", "not-a-uuid", 42]) {
      const res = await post("/api/snapshots", { retrievalId });
      assert.equal(res.status, 400, JSON.stringify(retrievalId));
    }
  });

  it("answers malformed JSON with a JSON error, not an HTML page", async () => {
    const res = await post("/api/snapshots", null, { raw: "{not json" });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "invalid_parameter");
  });

  it("answers an oversized save body with a JSON 413", async () => {
    const res = await post("/api/snapshots", { retrievalId: "x".repeat(2000) });
    assert.equal(res.status, 413);
    assert.equal(res.body.code, "request_too_large");
  });

  it("rejects bad list parameters with a field-level error", async () => {
    for (const query of ["limit=0", "limit=51", "limit=abc", "limit=1.5", "offset=-1", "page=2"]) {
      const res = await call(`/api/snapshots?${query}`);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.code, "invalid_parameter", query);
      assert.equal(res.body.details.errors.length, 1, query);
    }
  });

  it("rejects an invalid snapshot ID and returns 404 for an unknown one", async () => {
    for (const id of ["0", "abc", "1.5", "-1"]) {
      assert.equal((await call(`/api/snapshots/${id}`)).status, 400, id);
    }
    const missing = await call("/api/snapshots/999999");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, "snapshot_not_found");
  });

  it("never returns a stack trace or raw database text in an error", async () => {
    const responses = await Promise.all([
      call("/api/snapshots/999999"),
      post("/api/snapshots", { retrievalId: "bad" }),
      call("/api/snapshots?limit=0"),
    ]);
    for (const res of responses) {
      assert.equal(/\n\s+at /.test(res.text), false);
      assert.equal(/SQLITE|sqlite|CHECK constraint|FOREIGN KEY/.test(res.text), false);
    }
  });
});

describe("demonstration snapshots through HTTP", () => {
  it("lists a seeded demonstration snapshot with its label", async () => {
    seedDemoSnapshot(temp.db);
    const listed = await call("/api/snapshots?limit=50");
    const demo = listed.body.snapshots.find((s) => s.sourceMode === "demonstration");
    assert.ok(demo, "a demonstration snapshot is listed");
    assert.match(demo.demoLabel, /Not current data/);
  });
});

describe("retrieval store bounds", () => {
  it("evicts the oldest retrieval beyond its limit", () => {
    const store = createRetrievalStore({ limit: 2, idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
    store.put({ n: 1 });
    store.put({ n: 2 });
    store.put({ n: 3 });
    assert.equal(store.get("id-1"), null);
    assert.deepEqual(store.get("id-3"), { n: 3 });
  });

  it("forgets a retrieval after its time limit", () => {
    let clock = 0;
    const store = createRetrievalStore({ ttlMs: 1000, now: () => clock, idFactory: () => "r1" });
    store.put({ kept: false });
    clock = 1001;
    assert.equal(store.get("r1"), null);
  });
});
