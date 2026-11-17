// Shared helpers for snapshot tests. Each test gets its own temporary database file,
// removed afterwards. Nothing here touches the operator's database.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../../src/db/connection.js";
import { buildNoaaUrl, normalizeNoaaResponse } from "../../src/adapters/noaaClient.js";
import { buildSignalBody } from "../../src/signals/buildResponse.js";

export const STATION = "8454000";
export const PRODUCT = "water_temperature";
export const RANGE = 24;
export const RETRIEVED_AT = "2026-11-14T12:00:00.000Z";

export const GMT_24 = JSON.parse(
  readFileSync(new URL("../fixtures/noaa-8454000-water_temperature-gmt-24h.json", import.meta.url), "utf8")
);

export function tempDbPath() {
  return path.join(os.tmpdir(), `noaa-snapshots-${randomUUID()}.sqlite`);
}

export function openTempDb() {
  const file = tempDbPath();
  const db = openDatabase(file);
  return {
    db,
    file,
    cleanup() {
      // A test may already have closed the connection (for example, to reopen the file).
      try {
        db.close();
      } catch {
        // already closed
      }
      for (const suffix of ["", "-wal", "-shm"]) {
        if (existsSync(file + suffix)) rmSync(file + suffix);
      }
    },
  };
}

export function buildBody(payload, { range = RANGE, retrievedAt = RETRIEVED_AT } = {}) {
  const sourceUrl = buildNoaaUrl({ station: STATION, product: PRODUCT, range, interval: "h" });
  const result = normalizeNoaaResponse(payload, {
    station: STATION,
    product: PRODUCT,
    sourceUrl,
    retrievedAt,
  });
  const body = buildSignalBody({ station: STATION, product: PRODUCT, range, result });
  return { body, points: result.points };
}

// SYNTHETIC: constructed test input, not NOAA output. It exercises every exclusion
// reason, a genuine zero reading, an hour with no row, repeated flags, and a duplicate.
export const SYNTHETIC_PAYLOAD = {
  metadata: { id: STATION, name: "Providence" },
  data: [
    { t: "2026-11-14 00:00", v: "12.5", q: "p", f: "0,0,0" },
    { t: "2026-11-14 01:00", v: "0", q: "1" },
    { t: "2026-11-14 02:00", q: "x" },
    { t: "2026-11-14 03:00", v: "" },
    { t: "2026-11-14 04:00", v: "abc" },
    { t: "not a timestamp", v: "9.0" },
    { t: "2026-11-14 00:00", v: "11.0" },
    "not a row",
  ],
};
