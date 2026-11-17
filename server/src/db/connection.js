// Opens the SQLite database used for saved snapshots. Foreign keys are enforced, so an
// observation cannot exist without its snapshot. The file is created, and migrations
// run, on first open.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { runMigrations } from "./migrate.js";

export function openDatabase(filePath) {
  const inMemory = filePath === ":memory:";
  if (!inMemory) {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (!inMemory) {
    db.exec("PRAGMA journal_mode = WAL");
  }
  runMigrations(db);
  return db;
}
