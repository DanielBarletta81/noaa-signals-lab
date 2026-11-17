import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_FALLBACK_LABEL,
  canSaveLive,
  hasMoreSnapshots,
  mergeSnapshotPages,
  productLabel,
  snapshotStatusLine,
  snapshotTimes,
  sourceNoteFor,
  viewFromSnapshot,
} from "../src/view/snapshots.js";

const RETRIEVAL_ID = "3f1c9a2e-7b4d-4e8a-9c21-5d6e7f8a9b0c";

const LIVE_META = {
  id: 4,
  stationId: "8454000",
  stationName: "Providence",
  product: "water_temperature",
  requestedHours: 24,
  retrievedAt: "2026-11-14T00:00:00.000Z",
  savedAt: "2026-11-15T10:00:00.000Z",
  sourceMode: "live",
  demoLabel: null,
};

const DEMO_LABEL = "Demonstration: captured NOAA fixture, original capture approximately 2026-11-14 00:00 UTC. Not current data.";
const DEMO_META = { ...LIVE_META, id: 1, sourceMode: "demonstration", demoLabel: DEMO_LABEL };

// A signal body as the server builds it. Note the absence of retrievalId, which only
// the live response carries.
const SIGNAL_OK = {
  ok: true,
  status: "ok",
  station: "8454000",
  range: 24,
  quality: { receivedRows: 3, acceptedRows: 2, excludedRows: 1, excluded: [] },
  processed: { series: [], summary: { count: 2, latestValue: 15.2, latestTimestampUtc: "2026-11-13T23:00:00.000Z" } },
};

describe("saving the live set", () => {
  it("allows a save only once the live set has loaded and carries a retrieval ID", () => {
    assert.equal(canSaveLive({ status: "ready", data: { retrievalId: RETRIEVAL_ID }, savedAs: {} }), true);
    assert.equal(canSaveLive({ status: "empty", data: { retrievalId: RETRIEVAL_ID }, savedAs: {} }), true);
  });

  it("does not allow a save while loading, after an error, or without a retrieval ID", () => {
    assert.equal(canSaveLive({ status: "loading", data: null, savedAs: {} }), false);
    assert.equal(canSaveLive({ status: "error", data: null, savedAs: {} }), false);
    assert.equal(canSaveLive({ status: "ready", data: SIGNAL_OK, savedAs: {} }), false);
  });

  it("does not offer the same retrieval a second time once it has been saved", () => {
    const savedAs = { [RETRIEVAL_ID]: 4 };
    assert.equal(canSaveLive({ status: "ready", data: { retrievalId: RETRIEVAL_ID }, savedAs }), false);
  });

  it("a reopened copy can never be saved, because its view carries no retrieval ID", () => {
    const reopened = viewFromSnapshot({ snapshot: LIVE_META, signal: SIGNAL_OK });
    assert.equal(canSaveLive({ status: reopened.status, data: reopened.data, savedAs: {} }), false);
  });
});

describe("showing a reopened copy", () => {
  it("presents the stored body as the view, with ready or empty taken from its status", () => {
    const ready = viewFromSnapshot({ snapshot: LIVE_META, signal: SIGNAL_OK });
    assert.equal(ready.status, "ready");
    assert.equal(ready.data, SIGNAL_OK);
    assert.equal(ready.snapshot, LIVE_META);
    assert.equal(ready.error, null);

    const empty = viewFromSnapshot({ snapshot: LIVE_META, signal: { ...SIGNAL_OK, status: "empty" } });
    assert.equal(empty.status, "empty");
  });

  it("labels the two times apart: the original retrieval and the save", () => {
    const line = snapshotStatusLine(LIVE_META, SIGNAL_OK);
    assert.match(line, /Saved snapshot 4/);
    assert.match(line, /originally retrieved 14 Nov 2026, 00:00 UTC/);
    assert.match(line, /saved 15 Nov 2026, 10:00 UTC/);
  });

  it("uses the singular noun for a single accepted observation", () => {
    const one = { ...SIGNAL_OK, processed: { series: [], summary: { count: 1 } } };
    assert.match(snapshotStatusLine(LIVE_META, one), /1 accepted observation ·/);
    assert.match(snapshotStatusLine(LIVE_META, SIGNAL_OK), /2 accepted observations ·/);
  });

  it("gives the retrieval and save times as distinct formatted UTC values", () => {
    const times = snapshotTimes(LIVE_META);
    assert.equal(times.retrieved, "14 Nov 2026, 00:00 UTC");
    assert.equal(times.saved, "15 Nov 2026, 10:00 UTC");
    assert.notEqual(times.retrieved, times.saved);
  });
});

describe("source labelling", () => {
  it("keeps the full demonstration label on a demonstration copy", () => {
    const note = sourceNoteFor(DEMO_META);
    assert.equal(note.demonstration, true);
    assert.equal(note.text, DEMO_LABEL);
  });

  it("falls back to a plain warning when a demonstration copy has no label of its own", () => {
    const note = sourceNoteFor({ ...DEMO_META, demoLabel: null });
    assert.equal(note.text, DEMO_FALLBACK_LABEL);
  });

  it("describes a live-origin copy as saved and not updating, with no demonstration badge", () => {
    const note = sourceNoteFor(LIVE_META);
    assert.equal(note.demonstration, false);
    assert.match(note.text, /Saved copy/);
    assert.match(note.text, /does not update/);
  });

  it("names the product, and falls back to the raw code for an unknown product", () => {
    assert.equal(productLabel("water_temperature"), "Water temperature");
    assert.equal(productLabel("air_pressure"), "air_pressure");
  });
});

describe("paging the list", () => {
  it("keeps newest-first order across pages and drops repeats", () => {
    const first = [{ id: 9 }, { id: 8 }, { id: 7 }];
    const second = [{ id: 7 }, { id: 6 }];
    assert.deepEqual(
      mergeSnapshotPages(first, second).map((s) => s.id),
      [9, 8, 7, 6]
    );
  });

  it("reports more to load only while fewer items are shown than the total", () => {
    assert.equal(hasMoreSnapshots({ loaded: 10, total: 12 }), true);
    assert.equal(hasMoreSnapshots({ loaded: 12, total: 12 }), false);
    assert.equal(hasMoreSnapshots({ loaded: 0, total: 0 }), false);
  });
});
