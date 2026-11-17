import { createApp } from "./app.js";
import { openDatabase } from "./db/connection.js";
import { DEFAULT_MAX_SNAPSHOTS } from "./config/storage.js";
import { readServerConfig } from "./config/env.js";

// Configuration is read and checked before anything is opened. An invalid setting stops
// the server here, with a message and a non-zero exit, rather than starting with a
// different setting.
let config;
try {
  config = readServerConfig();
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  console.error("The server was not started. Correct the setting and start it again.");
  process.exit(1);
}

const { port, databasePath, maxSnapshots, trustProxyHops, allowedOrigins } = config;
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
