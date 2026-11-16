import { createApp } from "./app.js";
import { openDatabase } from "./db/connection.js";
import { resolveMaxSnapshots, resolveSnapshotDbPath, DEFAULT_MAX_SNAPSHOTS } from "./config/storage.js";
import { resolveAllowedOrigins, resolveTrustProxyHops } from "./config/security.js";

// Configuration is read and checked before anything is opened. An invalid setting stops
// the server here, with a message, rather than starting with a different setting.
const port = process.env.PORT || 4200;
const databasePath = resolveSnapshotDbPath();
const maxSnapshots = resolveMaxSnapshots();
const trustProxyHops = resolveTrustProxyHops();
const allowedOrigins = resolveAllowedOrigins();
const db = openDatabase(databasePath);
const app = createApp({ db, snapshotOptions: { maxSnapshots }, trustProxyHops, allowedOrigins });

const server = app.listen(port, () => {
  console.log(`NOAA Signal Explorer server running at http://localhost:${port}`);
  console.log(`Saved snapshots database: ${databasePath}`);
  console.log(
    `Shared snapshot archive: anyone using this server can read and add copies. Capacity ${maxSnapshots} copies` +
      (maxSnapshots === DEFAULT_MAX_SNAPSHOTS ? " (default)." : ".")
  );
  console.log(`Browser origins allowed: ${allowedOrigins.join(", ")}`);
  console.log(
    trustProxyHops === 0
      ? "Reverse proxy: none trusted. X-Forwarded-For is ignored."
      : `Reverse proxy: trusting ${trustProxyHops} hop(s) of X-Forwarded-For.`
  );
});

// Close the database cleanly on shutdown, so SQLite can finish its write-ahead log.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
