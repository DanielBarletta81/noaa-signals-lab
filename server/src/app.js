// Builds the Express application. The database is passed in, so tests can use a
// temporary file and the entry point can use the configured location.
//
// Deployment settings are passed in by the entry point, which reads them from the
// environment (see config/security.js). Nothing here reads a request to decide them.

import express from "express";
import { createOriginPolicy } from "./http/cors.js";
import { DEFAULT_ALLOWED_ORIGINS } from "./config/security.js";
import { createSignalsRouter } from "./routes/signals.js";
import { createSnapshotsRouter } from "./routes/snapshots.js";
import { defaultRetrievalStore } from "./retrievals/store.js";

// snapshotOptions: { maxSnapshots, writeLimit } for the shared archive. signalOptions:
// { cache, rateLimit } for GET /api/signals. trustProxyHops: how many reverse proxies you
// operate in front of this server (0 means none; X-Forwarded-For is ignored).
// allowedOrigins: browser origins allowed to read responses and to write.
export function createApp({
  db = null,
  retrievals = defaultRetrievalStore,
  snapshotOptions = {},
  signalOptions = {},
  trustProxyHops = 0,
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
} = {}) {
  const app = express();

  if (trustProxyHops > 0) {
    app.set("trust proxy", trustProxyHops);
  }

  const originPolicy = createOriginPolicy(allowedOrigins);
  app.use(originPolicy.corsMiddleware);

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      service: "NOAA Signal Explorer",
      timestamp: new Date().toISOString(),
      snapshots: db ? "available" : "not configured",
    });
  });

  app.use("/api", createSignalsRouter({ retrievals, ...signalOptions }));
  if (db) {
    app.use("/api", createSnapshotsRouter({ db, retrievals, originPolicy, ...snapshotOptions }));
  }

  return app;
}
