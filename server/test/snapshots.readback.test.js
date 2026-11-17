// Three checks on the save and reopen path, each against a real temporary database:
//   1. A reopened copy reports the time zone and interval stored with it, not constants.
//   2. If reading the saved copy back fails inside the transaction, the whole save rolls
//      back: no snapshot row, no observation rows.
//   3. After such a failure, the same connection still saves a valid retrieval normally.

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getSnapshot, saveSnapshot, saveSnapshotDescribed } from "../src/snapshots/repository.js";
import { buildBody, openTempDb, SYNTHETIC_PAYLOAD, GMT_24 } from "./helpers/snapshotFixtures.js";

let temp;
afterEach(() => {
  temp?.cleanup();
  temp = null;
});

describe("reopened copies report what was stored", () => {
  it("reads the time zone and interval back from storage, not from a constant", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    // Change the stored values directly. A copy built from a constant would not show this.
    temp.db.prepare("UPDATE snapshots SET time_zone = ?, interval_label = ? WHERE id = ?").run("XYZ", "daily", id);

    const reopened = getSnapshot(temp.db, id);
    assert.equal(reopened.body.source.timeZone, "XYZ");
    assert.equal(reopened.body.source.interval, "daily");
    assert.equal(reopened.snapshot.timeZone, "XYZ");
  });

  it("reports GMT and hourly for an untouched copy, as the live contract does", () => {
    temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    const reopened = getSnapshot(temp.db, id);
    assert.equal(reopened.body.source.timeZone, "GMT");
    assert.equal(reopened.body.source.interval, "hourly");
  });
});

describe("a failure while reading the saved copy back rolls the whole save back", () => {
  it("throws, and stores neither the snapshot row nor any observation row", () => {
    temp = openTempDb();
    const { body, points } = buildBody(SYNTHETIC_PAYLOAD);
    // Only the read-back of the new snapshot fails. The inserts before it succeed, so
    // this proves the rollback covers writes that had already happened.
    const flaky = {
      exec: (sql) => temp.db.exec(sql),
      prepare: (sql) => {
        if (sql.startsWith("SELECT * FROM snapshots WHERE id")) throw new Error("injected read failure");
        return temp.db.prepare(sql);
      },
    };
    assert.throws(
      () => saveSnapshotDescribed(flaky, { body, points, sourceMode: "live" }),
      /injected read failure/
    );
    assert.equal(temp.db.prepare("SELECT COUNT(*) AS n FROM snapshots").get().n, 0);
    assert.equal(temp.db.prepare("SELECT COUNT(*) AS n FROM observations").get().n, 0);
  });

  it("then saves a valid retrieval normally on the same connection", () => {
    temp = openTempDb();
    const { body, points } = buildBody(SYNTHETIC_PAYLOAD);
    const flaky = {
      exec: (sql) => temp.db.exec(sql),
      prepare: (sql) => {
        if (sql.startsWith("SELECT * FROM snapshots WHERE id")) throw new Error("injected read failure");
        return temp.db.prepare(sql);
      },
    };
    assert.throws(() => saveSnapshotDescribed(flaky, { body, points, sourceMode: "live" }));

    const { id, snapshot } = saveSnapshotDescribed(temp.db, { body, points, sourceMode: "live" });
    assert.equal(snapshot.id, id);
    assert.equal(temp.db.prepare("SELECT COUNT(*) AS n FROM snapshots").get().n, 1);
    assert.equal(temp.db.prepare("SELECT COUNT(*) AS n FROM observations").get().n, 8);
  });
});
