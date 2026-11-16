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
// SNAPSHOT_MAX_COUNT to change it.
//
// This number is not a storage ceiling by itself. Measured on Node 22.23.5: a typical
// 24-hour copy takes about 4 KB on disk, so 500 such copies take about 2 MB. The largest
// copy the save path accepts (200 rows, raw text at its 64 KB bound) takes about 74 KB, so
// 500 of those would take about 37 MB. Size SNAPSHOT_MAX_COUNT against the disk you have.
export const DEFAULT_MAX_SNAPSHOTS = 500;
export const MAX_SNAPSHOTS_LIMIT = 100000;

// An unset or blank SNAPSHOT_MAX_COUNT uses the default. Any other value must be a whole
// number from 1 to MAX_SNAPSHOTS_LIMIT. Anything else throws, so the server stops at startup
// instead of running with a capacity the operator did not choose.
export function resolveMaxSnapshots(env = process.env) {
  const configured = typeof env.SNAPSHOT_MAX_COUNT === "string" ? env.SNAPSHOT_MAX_COUNT.trim() : "";
  if (configured === "") return DEFAULT_MAX_SNAPSHOTS;
  // Plain digits only, so "1e3", "1.5", and "-3" are refused.
  if (!/^\d{1,7}$/.test(configured) || Number(configured) < 1 || Number(configured) > MAX_SNAPSHOTS_LIMIT) {
    throw new Error(
      `SNAPSHOT_MAX_COUNT must be a whole number from 1 to ${MAX_SNAPSHOTS_LIMIT}; got "${configured}".`
    );
  }
  return Number(configured);
}
