// Reads every operator setting the server uses, in one place, and checks each value that
// was explicitly supplied. The entry point calls readServerConfig() before it opens the
// database or listens on a port. Any invalid value throws, and the server does not start.
//
// Rule for every setting: an unset value, or one that is blank after trimming, uses the
// documented default. Any other value must be valid, or startup stops. A bad value is never
// replaced by a default, because that would run the server with a setting the operator did
// not choose.

import { resolveTimeoutMs } from "../adapters/noaaClient.js";
import { DEFAULT_ALLOWED_ORIGINS, resolveAllowedOrigins, resolveTrustProxyHops } from "./security.js";
import { DEFAULT_MAX_SNAPSHOTS, resolveMaxSnapshots, resolveSnapshotDbPath } from "./storage.js";

export const DEFAULT_PORT = 4200;

export function resolvePort(env = process.env) {
  const raw = typeof env.PORT === "string" ? env.PORT.trim() : "";
  if (raw === "") return DEFAULT_PORT;
  const value = Number(raw);
  if (!/^\d{1,5}$/.test(raw) || value < 1 || value > 65535) {
    throw new Error(`PORT must be a whole number from 1 to 65535; got "${raw}".`);
  }
  return value;
}

// Every setting is checked, and all the problems are reported together, so one restart
// shows everything to fix. Throws one Error whose message lists each problem.
export function readServerConfig(env = process.env) {
  const problems = [];
  const read = (reader, fallback) => {
    try {
      return reader(env);
    } catch (error) {
      problems.push(error.message);
      return fallback;
    }
  };

  const config = {
    port: read(resolvePort, DEFAULT_PORT),
    databasePath: read(resolveSnapshotDbPath, null),
    maxSnapshots: read(resolveMaxSnapshots, DEFAULT_MAX_SNAPSHOTS),
    trustProxyHops: read(resolveTrustProxyHops, 0),
    allowedOrigins: read(resolveAllowedOrigins, [...DEFAULT_ALLOWED_ORIGINS]),
    noaaTimeoutMs: read(resolveTimeoutMs, 8000),
  };

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return config;
}
