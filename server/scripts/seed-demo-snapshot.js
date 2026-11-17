// Saves the captured NOAA fixture as a labelled DEMONSTRATION snapshot. This is an
// explicit operator action. It is never triggered by a request.
//
// The fixture is real NOAA output captured earlier (see test/fixtures/README.md). It
// is not current data. Its original capture time is approximate, so the label says so.
//
//   npm run snapshots:seed-demo        (uses SNAPSHOT_DB_PATH, or the default location)

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSnapshotDbPath } from "../src/config/storage.js";
import { openDatabase } from "../src/db/connection.js";
import { buildNoaaUrl, normalizeNoaaResponse } from "../src/adapters/noaaClient.js";
import { buildSignalBody } from "../src/signals/buildResponse.js";
import { saveSnapshot } from "../src/snapshots/repository.js";

// True when this module is the script Node was asked to run. import.meta.url is
// percent-encoded (a space becomes %20), so the path is converted to a URL before the
// comparison. Comparing with a plain "file://" string silently skipped the seed for
// any path containing a space or other character that needs encoding.
export function isEntryPoint(moduleUrl, argvPath) {
  if (typeof argvPath !== "string" || argvPath === "") return false;
  return pathToFileURL(path.resolve(argvPath)).href === moduleUrl;
}

const STATION = "8454000";
const PRODUCT = "water_temperature";
const RANGE = 24;
// README in test/fixtures: captured approximately 00:00 UTC on 2026-11-14.
const APPROXIMATE_CAPTURE = "2026-11-14T00:00:00.000Z";
export const DEMO_LABEL =
  "Demonstration: captured NOAA fixture, original capture approximately 2026-11-14 00:00 UTC. Not current data.";

const fixture = JSON.parse(
  readFileSync(new URL("../test/fixtures/noaa-8454000-water_temperature-gmt-24h.json", import.meta.url), "utf8")
);

export function seedDemoSnapshot(db) {
  const existing = db
    .prepare("SELECT id FROM snapshots WHERE source_mode = 'demonstration' AND demo_label = ?")
    .get(DEMO_LABEL);
  if (existing) return { id: Number(existing.id), created: false };

  const sourceUrl = buildNoaaUrl({ station: STATION, product: PRODUCT, range: RANGE, interval: "h" });
  const result = normalizeNoaaResponse(fixture, {
    station: STATION,
    product: PRODUCT,
    sourceUrl,
    retrievedAt: APPROXIMATE_CAPTURE,
  });
  const body = buildSignalBody({ station: STATION, product: PRODUCT, range: RANGE, result });
  const id = saveSnapshot(db, {
    body,
    points: result.points,
    sourceMode: "demonstration",
    demoLabel: DEMO_LABEL,
  });
  return { id, created: true };
}

// Run directly, not when imported by tests.
if (isEntryPoint(import.meta.url, process.argv[1])) {
  const databasePath = resolveSnapshotDbPath();
  const db = openDatabase(databasePath);
  const { id, created } = seedDemoSnapshot(db);
  db.close();
  console.log(
    created
      ? `Saved demonstration snapshot ${id} to ${databasePath}.`
      : `Demonstration snapshot ${id} already exists in ${databasePath}; nothing was added.`
  );
}
