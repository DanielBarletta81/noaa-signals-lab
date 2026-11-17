// Save/reopen fidelity. Every field a reader can see must come back as it was saved:
// the original values and their text, units, time-zone metadata, NOAA row order,
// duplicate timestamps, exclusion reasons, and the q/f quality flags.
//
// The payload is SYNTHETIC: constructed test input, not NOAA output. It is built to
// hit each case at once. The archive is reopened from the file after a close, so the
// check covers what is on disk, not what is in memory.

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db/connection.js";
import { getSnapshot, saveSnapshot } from "../src/snapshots/repository.js";
import { buildBody, openTempDb } from "./helpers/snapshotFixtures.js";

// SYNTHETIC. Row positions are the index in this array.
const FIDELITY_PAYLOAD = {
  metadata: { id: "8454000", name: "Providence" },
  data: [
    { t: "2026-11-14 02:00", v: "12.30", q: "p", f: "0,0,0" }, // 0: out of order, text value
    { t: "2026-11-14 00:00", v: 11.5, f: "1,0,0" }, // 1: numeric JSON value, q absent
    { t: "2026-11-14 01:00", v: "0", q: "1", f: "0,0,0" }, // 2: genuine zero
    { t: "2026-11-14 01:00", v: "9.9", f: "0,0,1" }, // 3: duplicate of row 2's hour
    { t: "2026-11-14 03:00", v: "", q: "x" }, // 4: blank value
    { t: "2026-11-14 04:00" }, // 5: missing value
    "not a row", // 6: malformed row
    { t: "2026-11-14 05:00", v: "1e3" }, // 7: not in the accepted number format
  ],
};

let temp;
afterEach(() => {
  // Close the handle from the reopen (if any) before removing the file.
  try {
    temp?.db?.close();
  } catch {
    // already closed
  }
  temp?.cleanup();
  temp = null;
});

describe("save and reopen: values, units, and time zone", () => {
  it("keeps the raw value text and the parsed value side by side", () => {
    temp = openTempDb();
    const { body, points } = buildBody(FIDELITY_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    temp.db.close();

    temp.db = openDatabase(temp.file);
    const { body: reopened, snapshot } = getSnapshot(temp.db, id);

    // Text "12.30" is kept as text, and its parsed value is 12.3.
    const first = reopened.quality.accepted.find((r) => r.rowIndex === 0);
    assert.equal(first.rawValue, "12.30");
    assert.equal(first.value, 12.3);
    // A numeric JSON value stays a number.
    const numeric = reopened.quality.accepted.find((r) => r.rowIndex === 1);
    assert.equal(numeric.rawValue, 11.5);
    assert.equal(typeof numeric.rawValue, "number");

    assert.equal(snapshot.productUnits, "°C");
    assert.equal(snapshot.timeZone, "GMT");
    assert.equal(reopened.source.timeZone, "GMT");
    assert.equal(reopened.source.interval, "hourly");
  });
});

describe("save and reopen: NOAA row order, duplicates, and exclusions", () => {
  it("reopens to exactly the body that was saved, row for row", () => {
    temp = openTempDb();
    const { body, points } = buildBody(FIDELITY_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    temp.db.close();

    temp.db = openDatabase(temp.file);
    assert.deepEqual(getSnapshot(temp.db, id).body, body);
  });

  it("lists every received row exactly once, in NOAA's original order", () => {
    temp = openTempDb();
    const { body, points } = buildBody(FIDELITY_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    temp.db.close();

    temp.db = openDatabase(temp.file);
    const reopened = getSnapshot(temp.db, id).body.quality;
    const positions = [
      ...reopened.accepted.map((r) => r.rowIndex),
      ...reopened.excluded.map((r) => r.index),
    ].sort((a, b) => a - b);
    assert.deepEqual(positions, [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(positions.length, reopened.receivedRows);
  });

  it("keeps the accepted rows in NOAA order, even though the chart series is in time order", () => {
    temp = openTempDb();
    const { body, points } = buildBody(FIDELITY_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    temp.db.close();

    temp.db = openDatabase(temp.file);
    const reopened = getSnapshot(temp.db, id).body;
    assert.deepEqual(reopened.quality.accepted.map((r) => r.rowIndex), [0, 1, 2]);
    assert.deepEqual(
      reopened.processed.series.map((p) => p.time),
      ["2026-11-14T00:00:00.000Z", "2026-11-14T01:00:00.000Z", "2026-11-14T02:00:00.000Z"]
    );
  });

  it("keeps a duplicate timestamp as an exclusion at the real position of the later row", () => {
    temp = openTempDb();
    const { body, points } = buildBody(FIDELITY_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    temp.db.close();

    temp.db = openDatabase(temp.file);
    const { excluded } = getSnapshot(temp.db, id).body.quality;
    const duplicate = excluded.find((r) => r.reason === "duplicate_timestamp");
    assert.equal(duplicate.index, 3);
    assert.equal(duplicate.rawTimestamp, "2026-11-14 01:00");
    assert.equal(duplicate.rawValue, "9.9");
    assert.deepEqual(duplicate.flags, { quality: null, flag: "0,0,1" });
    // The earlier row for that hour (row 2) is the one kept.
    assert.equal(getSnapshot(temp.db, id).body.processed.series[1].value, 0);
  });

  it("keeps each exclusion reason and the raw text that explains it", () => {
    temp = openTempDb();
    const { body, points } = buildBody(FIDELITY_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    temp.db.close();

    temp.db = openDatabase(temp.file);
    const { excluded, excludedByReason } = getSnapshot(temp.db, id).body.quality;
    assert.deepEqual(
      excluded.map((r) => [r.index, r.reason]),
      [
        [3, "duplicate_timestamp"],
        [4, "blank_value"],
        [5, "missing_value"],
        [6, "malformed_row"],
        [7, "malformed_value"],
      ]
    );
    assert.equal(excluded.find((r) => r.index === 4).rawValue, "");
    assert.equal(excluded.find((r) => r.index === 7).rawValue, "1e3");
    assert.equal(excludedByReason.blank_value, 1);
    assert.equal(excludedByReason.malformed_row, 1);
  });

  it("never invents a value for an excluded row", () => {
    temp = openTempDb();
    const { body, points } = buildBody(FIDELITY_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    temp.db.close();

    temp.db = openDatabase(temp.file);
    const { excluded } = getSnapshot(temp.db, id).body.quality;
    for (const row of excluded) {
      assert.equal("value" in row, false, `row ${row.index} must not carry a value`);
    }
    const missing = excluded.find((r) => r.index === 5);
    assert.equal(missing.rawValue, null);
  });
});

describe("save and reopen: quality flags", () => {
  it("keeps q and f on accepted rows, and keeps an absent q as null, not as a guess", () => {
    temp = openTempDb();
    const { body, points } = buildBody(FIDELITY_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    temp.db.close();

    temp.db = openDatabase(temp.file);
    const accepted = getSnapshot(temp.db, id).body.quality.accepted;
    assert.deepEqual(accepted.find((r) => r.rowIndex === 0).flags, { quality: "p", flag: "0,0,0" });
    assert.deepEqual(accepted.find((r) => r.rowIndex === 1).flags, { quality: null, flag: "1,0,0" });
    assert.deepEqual(accepted.find((r) => r.rowIndex === 2).flags, { quality: "1", flag: "0,0,0" });
  });

  it("keeps q and f on excluded rows, including the flags of a row with no value", () => {
    temp = openTempDb();
    const { body, points } = buildBody(FIDELITY_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    temp.db.close();

    temp.db = openDatabase(temp.file);
    const { excluded } = getSnapshot(temp.db, id).body.quality;
    assert.deepEqual(excluded.find((r) => r.index === 4).flags, { quality: "x", flag: null });
    assert.deepEqual(excluded.find((r) => r.index === 3).flags, { quality: null, flag: "0,0,1" });
  });
});
