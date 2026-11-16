// The shared archive: repeated saves, the capacity bound, the per-address save limit,
// and a save that fails partway through. These run through the real HTTP routes against
// a temporary database. Only NOAA is absent, so each test puts its retrieval directly
// into a store it controls. Nothing here calls NOAA.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createRetrievalStore } from "../src/retrievals/store.js";
import { buildBody, openTempDb, SYNTHETIC_PAYLOAD } from "./helpers/snapshotFixtures.js";

const realFetch = globalThis.fetch;

// Starts an app on a free port with its own temporary database and retrieval store.
async function startArchive({ snapshotOptions = {}, retrievals = createRetrievalStore() } = {}) {
  const temp = openTempDb();
  const app = createApp({ db: temp.db, retrievals, snapshotOptions });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, init = {}) => {
    const res = await realFetch(`${baseUrl}${path}`, init);
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _nonJson: text.slice(0, 80) };
    }
    return { status: res.status, headers: res.headers, body, text };
  };
  const post = (payload) =>
    call("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  const count = (table) => temp.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  return {
    temp,
    retrievals,
    call,
    post,
    count,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      temp.cleanup();
    },
  };
}

// A retrieval exactly as GET /api/signals would store it, built from a synthetic payload.
function putRetrieval(retrievals, payload = SYNTHETIC_PAYLOAD) {
  const { body, points } = buildBody(payload);
  return retrievals.put({ body, points });
}

describe("repeated saves of one retrieval", () => {
  let archive;
  before(async () => {
    archive = await startArchive({ snapshotOptions: { writeLimit: { limit: 100, windowMs: 60000 } } });
  });
  after(async () => archive.close());

  it("creates one copy on the first save and returns that same copy on every later save", async () => {
    const retrievalId = putRetrieval(archive.retrievals);

    const first = await archive.post({ retrievalId });
    assert.equal(first.status, 201);
    assert.equal(first.body.created, true);

    const second = await archive.post({ retrievalId });
    assert.equal(second.status, 200);
    assert.equal(second.body.created, false);
    assert.equal(second.body.snapshot.id, first.body.snapshot.id);

    assert.equal(archive.count("snapshots"), 1);
  });

  it("never returns the retrieval ID in a save response or a list", async () => {
    const retrievalId = putRetrieval(archive.retrievals);
    const saved = await archive.post({ retrievalId });
    assert.equal(JSON.stringify(saved.body).includes(retrievalId), false);
    const listed = await archive.call("/api/snapshots");
    assert.equal(listed.text.includes(retrievalId), false);
  });
});

describe("capacity: the archive has a fixed maximum and never deletes to make room", () => {
  let archive;
  before(async () => {
    archive = await startArchive({
      snapshotOptions: { maxSnapshots: 2, writeLimit: { limit: 100, windowMs: 60000 } },
    });
  });
  after(async () => archive.close());

  it("saves up to the maximum, then refuses with 507 and an explanation", async () => {
    const a = await archive.post({ retrievalId: putRetrieval(archive.retrievals) });
    const b = await archive.post({ retrievalId: putRetrieval(archive.retrievals) });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);

    const refused = await archive.post({ retrievalId: putRetrieval(archive.retrievals) });
    assert.equal(refused.status, 507);
    assert.equal(refused.body.code, "archive_full");
    assert.match(refused.body.message, /Nothing was saved/);
    assert.equal(refused.body.details.limit, 2);
  });

  it("leaves every existing copy in place and writes no rows for the refused save", async () => {
    const list = await archive.call("/api/snapshots");
    assert.equal(list.body.total, 2);
    assert.equal(archive.count("snapshots"), 2);
    // Two saved copies, each with the synthetic payload's 8 rows, and nothing more.
    assert.equal(archive.count("observations"), 16);
  });
});

describe("a save that fails partway through leaves no partial copy", () => {
  let archive;
  before(async () => {
    archive = await startArchive({ snapshotOptions: { writeLimit: { limit: 100, windowMs: 60000 } } });
  });
  after(async () => archive.close());

  it("answers 503 and stores neither the snapshot row nor any observation row", async () => {
    // One accepted point with no value. The header insert succeeds, then the first
    // observation insert breaks the schema's CHECK, so the transaction must roll back.
    const { body, points } = buildBody(SYNTHETIC_PAYLOAD);
    const broken = [{ ...points[0], value: null }, ...points.slice(1)];
    const retrievalId = archive.retrievals.put({ body, points: broken });

    const before = { snapshots: archive.count("snapshots"), observations: archive.count("observations") };
    const originalError = console.error;
    console.error = () => {};
    let response;
    try {
      response = await archive.post({ retrievalId });
    } finally {
      console.error = originalError;
    }

    assert.equal(response.status, 503);
    assert.equal(response.body.code, "storage_unavailable");
    assert.match(response.body.message, /Nothing was saved/);
    assert.equal(archive.count("snapshots"), before.snapshots);
    assert.equal(archive.count("observations"), before.observations);
  });

  it("does not record the failed retrieval as saved, so a later save is not a false duplicate", async () => {
    const { body, points } = buildBody(SYNTHETIC_PAYLOAD);
    const broken = [{ ...points[0], value: null }, ...points.slice(1)];
    const retrievalId = archive.retrievals.put({ body, points: broken });
    const originalError = console.error;
    console.error = () => {};
    try {
      await archive.post({ retrievalId });
    } finally {
      console.error = originalError;
    }
    assert.equal(archive.retrievals.savedSnapshotId(retrievalId), null);
  });
});

describe("retrieval retention reaches the browser as a clear, recoverable answer", () => {
  it("answers 404 retrieval_not_found for an evicted retrieval, and says to load again", async () => {
    const retrievals = createRetrievalStore({ limit: 1 });
    const archive = await startArchive({
      retrievals,
      snapshotOptions: { writeLimit: { limit: 100, windowMs: 60000 } },
    });
    try {
      const oldest = putRetrieval(retrievals);
      putRetrieval(retrievals); // capacity 1: this evicts the oldest
      const response = await archive.post({ retrievalId: oldest });
      assert.equal(response.status, 404);
      assert.equal(response.body.code, "retrieval_not_found");
      assert.match(response.body.message, /Load the observations again/);
    } finally {
      await archive.close();
    }
  });

  it("answers 404 retrieval_not_found for an expired retrieval", async () => {
    let clock = 1_000_000;
    const retrievals = createRetrievalStore({ ttlMs: 60_000, now: () => clock });
    const archive = await startArchive({
      retrievals,
      snapshotOptions: { writeLimit: { limit: 100, windowMs: 60000 } },
    });
    try {
      const retrievalId = putRetrieval(retrievals);
      clock += 60_001;
      const response = await archive.post({ retrievalId });
      assert.equal(response.status, 404);
      assert.equal(response.body.code, "retrieval_not_found");
    } finally {
      await archive.close();
    }
  });
});

describe("the save request body is validated and described correctly", () => {
  let archive;
  before(async () => {
    archive = await startArchive({ snapshotOptions: { writeLimit: { limit: 100, windowMs: 60000 } } });
  });
  after(async () => archive.close());

  it("describes a bad save body as a save-request problem, not a query-parameter problem", async () => {
    const response = await archive.post({ retrievalId: "not-a-uuid" });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "invalid_parameter");
    assert.equal(response.body.message, "The save request is not valid.");
    assert.equal(/query parameter/i.test(response.text), false);
  });

  it("describes malformed JSON as a save-request problem", async () => {
    const response = await archive.post("{not json");
    assert.equal(response.status, 400);
    assert.equal(response.body.message, "The save request is not valid.");
  });
});

describe("the shared archive limits saves per address", () => {
  it("answers 429 with Retry-After once one address has used its saves for the window", async () => {
    const archive = await startArchive({
      snapshotOptions: { writeLimit: { limit: 1, windowMs: 60000 } },
    });
    try {
      const first = await archive.post({ retrievalId: putRetrieval(archive.retrievals) });
      assert.equal(first.status, 201);

      const second = await archive.post({ retrievalId: putRetrieval(archive.retrievals) });
      assert.equal(second.status, 429);
      assert.equal(second.body.code, "rate_limited");
      const retryAfter = Number(second.headers.get("retry-after"));
      assert.equal(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60, true);
      assert.equal(archive.count("snapshots"), 1);
    } finally {
      await archive.close();
    }
  });

  it("leaves reads unlimited, so the list and copies can still be opened", async () => {
    const archive = await startArchive({
      snapshotOptions: { writeLimit: { limit: 1, windowMs: 60000 } },
    });
    try {
      await archive.post({ retrievalId: putRetrieval(archive.retrievals) });
      for (let i = 0; i < 5; i += 1) {
        const listed = await archive.call("/api/snapshots");
        assert.equal(listed.status, 200);
      }
    } finally {
      await archive.close();
    }
  });
});
