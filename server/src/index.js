import { createApp } from "./app.js";
import { openDatabase } from "./db/connection.js";
import { resolveMaxSnapshots, resolveSnapshotDbPath, DEFAULT_MAX_SNAPSHOTS } from "./config/storage.js";

const port = process.env.PORT || 4200;
const databasePath = resolveSnapshotDbPath();
const maxSnapshots = resolveMaxSnapshots();
const db = openDatabase(databasePath);
const app = createApp({ db, snapshotOptions: { maxSnapshots } });

const server = app.listen(port, () => {
  console.log(`NOAA Signal Explorer server running at http://localhost:${port}`);
  console.log(`Saved snapshots database: ${databasePath}`);
  console.log(
    `Shared snapshot archive: anyone using this server can read and add copies. Capacity ${maxSnapshots} copies` +
      (maxSnapshots === DEFAULT_MAX_SNAPSHOTS ? " (default)." : ".")
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
