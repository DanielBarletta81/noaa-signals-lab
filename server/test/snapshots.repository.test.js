import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getSnapshot,
  listSnapshots,
  MAX_SNAPSHOT_ROWS,
  runMigrationsForTest,
  saveSnapshot,
  SnapshotTooLargeError,
} from "./testExports.js";
import { buildBody, GMT_24, openTempDb, PRODUCT, RETRIEVED_AT, SYNTHETIC_PAYLOAD } from "./helpers/snapshotFixtures.js";
import { seedDemoSnapshot, DEMO_LABEL } from "../scripts/seed-demo-snapshot.js";

let temp;
afterEach(() => {
  temp?.cleanup();
  temp = null;
});

describe("save and reopen round trip", () => {
  it("reopens a real NOAA fixture to exactly the body that was saved", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });

    const reopened = getSnapshot(temp.db, id);
    assert.deepEqual(reopened.body, body);
    assert.equal(reopened.snapshot.sourceMode, "live");
    assert.equal(reopened.snapshot.demoLabel, null);
    assert.equal(reopened.snapshot.retrievedAt, body.source.retrievedAt);
    assert.equal(reopened.snapshot.savedAt.length > 0, true);
  });

  it("keeps the original retrieval time separate from the save time", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    const savedAt = "2026-11-15T09:30:00.000Z";
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live", savedAt });
    const meta = getSnapshot(temp.db, id).snapshot;
    assert.equal(meta.retrievedAt, RETRIEVED_AT);
    assert.equal(meta.savedAt, savedAt);
    assert.notEqual(meta.retrievedAt, meta.savedAt);
  });
});

describe("excluded values, missing values, units, flags, and timestamps", () => {
  it("preserves every exclusion, the genuine zero, the raw text, and the flags", () => {
    temp = openTempDb();
    const { body, points } = buildBody(SYNTHETIC_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    const reopened = getSnapshot(temp.db, id);

    assert.deepEqual(reopened.body, body);
    assert.equal(reopened.body.quality.receivedRows, 8);
    assert.equal(reopened.body.quality.acceptedRows, 2);
    assert.equal(reopened.body.quality.excludedRows, 6);

    const reasons = reopened.body.quality.excluded.map((e) => e.reason);
    assert.deepEqual(reasons, [
      "missing_value",
      "blank_value",
      "malformed_value",
      "malformed_timestamp",
      "duplicate_timestamp",
      "malformed_row",
    ]);

    // A real reading of 0 stays 0, and is not converted to null or dropped.
    const zero = reopened.body.processed.series.find((p) => p.time === "2026-11-14T01:00:00.000Z");
    assert.equal(zero.value, 0);
    assert.equal(Object.is(zero.value, 0), true);

    // The excluded missing-value row keeps its flag, and no value is invented for it.
    const missing = reopened.body.quality.excluded[0];
    assert.equal(missing.rawValue, null);
    assert.deepEqual(missing.flags, { quality: "x", flag: null });
  });

  it("creates no observation for an hour NOAA did not return", () => {
    temp = openTempDb();
    const { body, points } = buildBody(SYNTHETIC_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    const times = getSnapshot(temp.db, id).body.processed.series.map((p) => p.time);
    assert.equal(times.includes("2026-11-14T05:00:00.000Z"), false);
    assert.equal(times.length, 2);
  });

  it("keeps the product units and the GMT time-zone metadata", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    const { snapshot, body: reopened } = getSnapshot(temp.db, id);
    assert.equal(snapshot.productUnits, "°C");
    assert.equal(snapshot.timeZone, "GMT");
    assert.equal(reopened.source.timeZone, "GMT");
    assert.equal(reopened.source.interval, "hourly");
  });

  it("keeps each accepted observation's original row order", () => {
    temp = openTempDb();
    const { body, points } = buildBody(SYNTHETIC_PAYLOAD);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    const rows = temp.db
      .prepare("SELECT row_order, accepted FROM observations WHERE snapshot_id = ? ORDER BY row_order")
      .all(id);
    assert.deepEqual(rows.map((r) => r.row_order), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(rows.map((r) => r.accepted), [1, 1, 0, 0, 0, 0, 0, 0]);
  });
});

describe("transactions and integrity", () => {
  it("rolls back the snapshot and every observation when one observation insert fails", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    // Two accepted points with the same row position: the second insert violates the
    // UNIQUE constraint after the snapshot row and the first observation were written.
    const broken = [points[0], { ...points[1], rowIndex: points[0].rowIndex }, ...points.slice(2)];

    assert.throws(() => saveSnapshot(temp.db, { body, points: broken, sourceMode: "live" }));
    assert.equal(temp.db.prepare("SELECT COUNT(*) AS n FROM snapshots").get().n, 0);
    assert.equal(temp.db.prepare("SELECT COUNT(*) AS n FROM observations").get().n, 0);

    // The connection is not left inside a transaction; a valid save still works.
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    assert.equal(getSnapshot(temp.db, id).body.quality.receivedRows, GMT_24.data.length);
  });

  it("refuses a snapshot whose observation count does not match the rows NOAA returned", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    const short = { ...body, quality: { ...body.quality, receivedRows: body.quality.receivedRows + 1 } };
    assert.throws(() => saveSnapshot(temp.db, { body: short, points, sourceMode: "live" }), /does not match/);
    assert.equal(temp.db.prepare("SELECT COUNT(*) AS n FROM snapshots").get().n, 0);
  });

  it("refuses more rows than the bound allows", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    const many = Array.from({ length: MAX_SNAPSHOT_ROWS + 1 }, (_, i) => ({ ...points[0], rowIndex: i }));
    const big = { ...body, quality: { ...body.quality, receivedRows: many.length, acceptedRows: many.length, excludedRows: 0 } };
    assert.throws(() => saveSnapshot(temp.db, { body: big, points: many, sourceMode: "live" }), SnapshotTooLargeError);
  });

  it("enforces foreign keys, so an observation cannot exist without its snapshot", () => {
    temp = openTempDb();
    assert.throws(() =>
      temp.db
        .prepare(
          "INSERT INTO observations (snapshot_id, row_order, observed_at_utc, observed_at_raw, raw_value, value, accepted, exclusion_reason, flag_quality, flag_flag) VALUES (999, 0, NULL, 'null', 'null', NULL, 0, 'missing_value', 'null', 'null')"
        )
        .run()
    );
  });

  it("refuses an accepted observation with no value, at the database level", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    assert.throws(() =>
      temp.db
        .prepare(
          "INSERT INTO observations (snapshot_id, row_order, observed_at_utc, observed_at_raw, raw_value, value, accepted, exclusion_reason, flag_quality, flag_flag) VALUES (?, 500, 2026-11-14T06:00:00.000Z, null, null, NULL, 1, NULL, null, null)"
        )
        .run(id)
    );
  });

  it("refuses a demonstration snapshot without a label, and a live snapshot with one", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    assert.throws(() => saveSnapshot(temp.db, { body, points, sourceMode: "demonstration" }));
    assert.throws(() => saveSnapshot(temp.db, { body, points, sourceMode: "live", demoLabel: "x" }));
    assert.throws(() => saveSnapshot(temp.db, { body, points, sourceMode: "imported" }));
  });

  it("refuses a product that is not on the allowlist", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    assert.throws(() => saveSnapshot(temp.db, { body: { ...body, product: "salinity" }, points, sourceMode: "live" }));
  });

  it("returns null for an unknown snapshot ID", () => {
    temp = openTempDb();
    assert.equal(getSnapshot(temp.db, 12345), null);
  });
});

describe("listing and demonstration snapshots", () => {
  it("lists newest first, with a bounded page and a total", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    for (const savedAt of ["2026-11-15T10:00:00.000Z", "2026-11-15T11:00:00.000Z", "2026-11-15T12:00:00.000Z"]) {
      saveSnapshot(temp.db, { body, points, sourceMode: "live", savedAt });
    }
    const page1 = listSnapshots(temp.db, { limit: 2, offset: 0 });
    const page2 = listSnapshots(temp.db, { limit: 2, offset: 2 });
    assert.equal(page1.total, 3);
    assert.deepEqual(page1.snapshots.map((s) => s.savedAt), ["2026-11-15T12:00:00.000Z", "2026-11-15T11:00:00.000Z"]);
    assert.deepEqual(page2.snapshots.map((s) => s.savedAt), ["2026-11-15T10:00:00.000Z"]);
  });

  it("labels a seeded demonstration snapshot, with its approximate capture time, and seeds it once", () => {
    temp = openTempDb();
    const first = seedDemoSnapshot(temp.db);
    const second = seedDemoSnapshot(temp.db);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.id, first.id);

    const meta = getSnapshot(temp.db, first.id).snapshot;
    assert.equal(meta.sourceMode, "demonstration");
    assert.equal(meta.demoLabel, DEMO_LABEL);
    assert.match(meta.demoLabel, /Not current data/);
    assert.equal(meta.retrievedAt, "2026-11-14T00:00:00.000Z");
  });
});

describe("schema versioning", () => {
  it("records the schema version and does not migrate twice", () => {
    temp = openTempDb();
    assert.equal(Number(temp.db.prepare("PRAGMA user_version").get().user_version), 1);
    assert.equal(runMigrationsForTest(temp.db), 1);
    assert.equal(Number(temp.db.prepare("PRAGMA user_version").get().user_version), 1);
  });

  it("refuses a database whose schema is newer than this server", () => {
    temp = openTempDb();
    temp.db.exec("PRAGMA user_version = 99");
    assert.throws(() => runMigrationsForTest(temp.db), /newer than this server supports/);
  });
});
