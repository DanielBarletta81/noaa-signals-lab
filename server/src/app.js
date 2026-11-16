// Builds the Express application. The database is passed in, so tests can use a
// temporary file and the entry point can use the configured location.

import express from "express";
import cors from "cors";
import { createSignalsRouter } from "./routes/signals.js";
import { createSnapshotsRouter } from "./routes/snapshots.js";
import { defaultRetrievalStore } from "./retrievals/store.js";

// snapshotOptions: { maxSnapshots, writeLimit } for the shared archive. Defaults apply
// when omitted (see routes/snapshots.js).
export function createApp({ db = null, retrievals = defaultRetrievalStore, snapshotOptions = {} } = {}) {
  const app = express();

  app.use(cors());

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      service: "NOAA Signal Explorer",
      timestamp: new Date().toISOString(),
      snapshots: db ? "available" : "not configured",
    });
  });

  app.use("/api", createSignalsRouter({ retrievals }));
  if (db) {
    app.use("/api", createSnapshotsRouter({ db, retrievals, ...snapshotOptions }));
  }

  return app;
}
