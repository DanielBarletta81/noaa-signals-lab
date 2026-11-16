// A save made through the HTTP API must survive a crash and a restart. The server runs as
// a real process against one database file. The first process is killed with SIGKILL, so
// it gets no chance to close the database. A completed save must still be there.
//
// The fixture preload answers NOAA locally. The test needs no network access.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  freePort,
  killServer,
  PRELOAD_NOAA_FIXTURE,
  removeDatabaseFiles,
  startServer,
  stopServer,
  tempDatabaseFile,
} from "./helpers/serverProcess.js";

const realFetch = globalThis.fetch;
const LIVE_QUERY = "/api/signals?station=8454000&product=water_temperature&range=24";

async function loadLive(base) {
  const res = await realFetch(`${base}${LIVE_QUERY}`);
  return { status: res.status, body: await res.json() };
}

async function save(base, retrievalId) {
  const res = await realFetch(`${base}/api/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retrievalId }),
  });
  return { status: res.status, body: await res.json() };
}

describe("a completed save survives a crash and a restart", () => {
  it("keeps the copy after SIGKILL, and the archive still accepts saves after the restart", async () => {
    const file = tempDatabaseFile();
    try {
      // First process: load, save, then crash without a clean shutdown.
      const port1 = await freePort();
      const base1 = `http://127.0.0.1:${port1}`;
      const first = await startServer(file, port1, { preload: PRELOAD_NOAA_FIXTURE });
      const live = await loadLive(base1);
      assert.equal(live.status, 200);
      const saved = await save(base1, live.body.retrievalId);
      assert.equal(saved.status, 201);
      const savedId = saved.body.snapshot.id;
      await killServer(first);

      // Second process, same file: the copy is there and reopens to the saved body.
      const port2 = await freePort();
      const base2 = `http://127.0.0.1:${port2}`;
      const second = await startServer(file, port2, { preload: PRELOAD_NOAA_FIXTURE });
      try {
        const reopened = await realFetch(`${base2}/api/snapshots/${savedId}`).then((r) => r.json());
        assert.equal(reopened.ok, true);
        const { retrievalId: _omitted, ...liveSignal } = live.body;
        assert.deepEqual(reopened.signal, liveSignal);

        const listed = await realFetch(`${base2}/api/snapshots`).then((r) => r.json());
        assert.equal(listed.total, 1);
        assert.equal(listed.snapshots[0].id, savedId);

        // Retrievals live in memory, so the one from the first process is gone.
        // The save explains that and does not write anything.
        const stale = await save(base2, live.body.retrievalId);
        assert.equal(stale.status, 404);
        assert.equal(stale.body.code, "retrieval_not_found");

        // A new load after the restart can be saved, and it adds a second copy.
        const fresh = await loadLive(base2);
        const again = await save(base2, fresh.body.retrievalId);
        assert.equal(again.status, 201);
        const relisted = await realFetch(`${base2}/api/snapshots`).then((r) => r.json());
        assert.equal(relisted.total, 2);
      } finally {
        await stopServer(second);
      }
    } finally {
      removeDatabaseFiles(file);
    }
  });
});
