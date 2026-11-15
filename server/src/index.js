import { createApp } from "./app.js";
import { openDatabase } from "./db/connection.js";
import { resolveSnapshotDbPath } from "./config/storage.js";

const port = process.env.PORT || 4200;
const databasePath = resolveSnapshotDbPath();
const db = openDatabase(databasePath);
const app = createApp({ db });

const server = app.listen(port, () => {
  console.log(`NOAA Signal Explorer server running at http://localhost:${port}`);
  console.log(`Saved snapshots database: ${databasePath}`);
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
