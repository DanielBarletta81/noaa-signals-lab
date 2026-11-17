// Bounds on one save. A request body is capped at 1 KB (tested in the routes suite). Here:
// the observation count is capped at MAX_SNAPSHOT_ROWS, and the text stored for one copy
// is capped at MAX_SNAPSHOT_TEXT_BYTES. Row count alone does not limit storage, so the text
// bound is checked on its own.

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MAX_SNAPSHOT_ROWS, saveSnapshot, SnapshotTextTooLargeError } from "../src/snapshots/repository.js";
import { startTestApp } from "./helpers/httpApp.js";
import { buildBody, openTempDb } from "./helpers/snapshotFixtures.js";

// A synthetic payload with `count` rows. Each row is excluded (its value is not numeric),
// so its raw text is kept and counted, and each has a unique hour so none is a duplicate.
function longRowsPayload(count, valueLength) {
  const start = Date.UTC(2026, 10, 1);
  const data = Array.from({ length: count }, (_, i) => ({
    t: new Date(start + i * 3600_000).toISOString().slice(0, 16).replace("T", " "),
    v: "v".repeat(valueLength),
  }));
  return { metadata: { id: "8454000", name: "Providence" }, data };
}

let temp;
afterEach(() => {
  temp?.cleanup();
  temp = null;
});

describe("the observation count of one save", () => {
  it("is capped at MAX_SNAPSHOT_ROWS, the same bound NOAA responses are held to", () => {
    assert.equal(MAX_SNAPSHOT_ROWS, 200);
  });
});

describe("the text stored for one copy", () => {
  it("accepts a full-length copy whose text is ordinary NOAA-sized", () => {
    temp = openTempDb();
    const { body, points } = buildBody(longRowsPayload(MAX_SNAPSHOT_ROWS, 8));
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    assert.equal(Number.isInteger(id), true);
    assert.equal(temp.db.prepare("SELECT COUNT(*) AS n FROM observations").get().n, MAX_SNAPSHOT_ROWS);
  });

  it("refuses a copy whose text is over the bound, stores nothing, and says why", () => {
    temp = openTempDb();
    // 200 rows of 400 characters is about 80 KB of raw text, above the 64 KB bound.
    const { body, points } = buildBody(longRowsPayload(MAX_SNAPSHOT_ROWS, 400));
    assert.throws(() => saveSnapshot(temp.db, { body, points, sourceMode: "live" }), SnapshotTextTooLargeError);
    assert.equal(temp.db.prepare("SELECT COUNT(*) AS n FROM snapshots").get().n, 0);
    assert.equal(temp.db.prepare("SELECT COUNT(*) AS n FROM observations").get().n, 0);
  });

  it("accepts a 72-hour copy of ordinary NOAA-sized rows, which is the largest window a user can ask for", () => {
    temp = openTempDb();
    const { body, points } = buildBody(longRowsPayload(72, 8));
    assert.equal(Number.isInteger(saveSnapshot(temp.db, { body, points, sourceMode: "live" })), true);
  });
});

describe("over HTTP, a save over either bound is refused with 413 and nothing is written", () => {
  it("answers 413 snapshot_too_large for an over-size copy", async () => {
    const app = await startTestApp({ snapshotOptions: { writeLimit: { limit: 100, windowMs: 60000 } } });
    try {
      const { body, points } = buildBody(longRowsPayload(MAX_SNAPSHOT_ROWS, 400));
      const retrievalId = app.retrievals.put({ body, points });
      const res = await app.request("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retrievalId }),
      });
      assert.equal(res.status, 413);
      assert.equal(res.body.code, "snapshot_too_large");
      assert.equal(app.count("snapshots"), 0);
      assert.equal(app.count("observations"), 0);
    } finally {
      await app.close();
    }
  });
});
