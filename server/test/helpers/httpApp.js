// Starts the real Express app on a free loopback port, with its own temporary database and
// retrieval store. Options are passed straight through to createApp, so each test sets
// exactly the deployment settings it checks. Nothing here calls NOAA: tests that need a
// NOAA response install a fetch mock first.

import { createApp } from "../../src/app.js";
import { createRetrievalStore } from "../../src/retrievals/store.js";
import { openTempDb } from "./snapshotFixtures.js";

export async function startTestApp(options = {}) {
  const temp = options.db ? null : openTempDb();
  const db = options.db ?? temp.db;
  const retrievals = options.retrievals ?? createRetrievalStore();
  const app = createApp({ ...options, db, retrievals });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    db,
    retrievals,
    temp,
    // Plain fetch against this server. Callers pass headers, including Origin.
    async request(path, init = {}) {
      const res = await fetch(`${baseUrl}${path}`, init);
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      return { status: res.status, headers: res.headers, body, text };
    },
    count(table) {
      return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
      if (temp) temp.cleanup();
    },
  };
}
