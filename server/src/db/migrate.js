// Applies versioned SQL migrations. The schema version is stored in SQLite's
// user_version. Each migration runs in its own transaction together with its version
// bump, so a failed migration leaves the database at the previous version.

import { readdirSync, readFileSync } from "node:fs";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);
const FILE_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/;

export function listMigrations(dir = MIGRATIONS_DIR) {
  const migrations = readdirSync(dir)
    .filter((name) => FILE_PATTERN.test(name))
    .map((name) => ({
      version: Number(FILE_PATTERN.exec(name)[1]),
      name,
      sql: readFileSync(new URL(name, dir), "utf8"),
    }))
    .sort((a, b) => a.version - b.version);

  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Migration versions must be contiguous from 001; found ${migration.name}.`);
    }
  });
  return migrations;
}

export function runMigrations(db, migrations = listMigrations()) {
  const current = Number(db.prepare("PRAGMA user_version").get().user_version);
  const latest = migrations.length > 0 ? migrations[migrations.length - 1].version : 0;

  if (current > latest) {
    throw new Error(
      `The database schema is version ${current}, which is newer than this server supports (${latest}).`
    );
  }

  for (const migration of migrations) {
    if (migration.version <= current) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration.sql);
      // user_version cannot be bound as a parameter. The value is a number from a
      // file name matched by FILE_PATTERN, not user input.
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return latest;
}
