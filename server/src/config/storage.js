// Where the snapshot database lives. Set by the operator with SNAPSHOT_DB_PATH, never by
// a request. A relative path is resolved from the server directory. The default is
// server/data/noaa-signals.sqlite, which is ignored by Git.

import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const DEFAULT_SNAPSHOT_DB_PATH = path.join(SERVER_ROOT, "data", "noaa-signals.sqlite");

export function resolveSnapshotDbPath(env = process.env) {
  const configured = typeof env.SNAPSHOT_DB_PATH === "string" ? env.SNAPSHOT_DB_PATH.trim() : "";
  if (configured === "") return DEFAULT_SNAPSHOT_DB_PATH;
  return path.resolve(SERVER_ROOT, configured);
}

// Saved snapshots are shared by everyone who uses this server, with no accounts and no
// deletion. This is the most copies the archive will hold. When it is full, saves are
// refused with a clear message, and nothing already saved is removed. Set
// SNAPSHOT_MAX_COUNT to change it. Measured on Node 22.23.5: about 4 KB on disk per
// 24-hour copy, so 500 copies take about 2 MB. A 72-hour copy is about three times that.
export const DEFAULT_MAX_SNAPSHOTS = 500;
export const MAX_SNAPSHOTS_LIMIT = 100000;

// A value that is not a whole number from 1 to MAX_SNAPSHOTS_LIMIT falls back to the
// default, as NOAA_TIMEOUT_MS does. The fallback is reported in the startup log.
export function resolveMaxSnapshots(env = process.env) {
  const configured = typeof env.SNAPSHOT_MAX_COUNT === "string" ? env.SNAPSHOT_MAX_COUNT.trim() : "";
  if (configured === "") return DEFAULT_MAX_SNAPSHOTS;
  // Plain digits only, so "1e3" and "1.5" are not read as whole numbers.
  if (!/^\d{1,7}$/.test(configured)) return DEFAULT_MAX_SNAPSHOTS;
  const value = Number(configured);
  return value >= 1 && value <= MAX_SNAPSHOTS_LIMIT ? value : DEFAULT_MAX_SNAPSHOTS;
}
