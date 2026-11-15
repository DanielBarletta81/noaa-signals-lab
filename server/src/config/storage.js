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
