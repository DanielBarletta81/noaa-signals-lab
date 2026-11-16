import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_SNAPSHOTS,
  MAX_SNAPSHOTS_LIMIT,
  resolveMaxSnapshots,
} from "../src/config/storage.js";

describe("SNAPSHOT_MAX_COUNT: the archive capacity", () => {
  it("defaults to 500 copies when unset or blank", () => {
    assert.equal(DEFAULT_MAX_SNAPSHOTS, 500);
    assert.equal(resolveMaxSnapshots({}), 500);
    assert.equal(resolveMaxSnapshots({ SNAPSHOT_MAX_COUNT: "   " }), 500);
  });

  it("accepts a whole number from 1 up to the stated limit", () => {
    assert.equal(resolveMaxSnapshots({ SNAPSHOT_MAX_COUNT: "25" }), 25);
    assert.equal(resolveMaxSnapshots({ SNAPSHOT_MAX_COUNT: " 1 " }), 1);
    assert.equal(resolveMaxSnapshots({ SNAPSHOT_MAX_COUNT: String(MAX_SNAPSHOTS_LIMIT) }), MAX_SNAPSHOTS_LIMIT);
  });

  it("falls back to the default for zero, negatives, fractions, text, and values over the limit", () => {
    for (const value of ["0", "-3", "1.5", "1e3", "abc", String(MAX_SNAPSHOTS_LIMIT + 1)]) {
      assert.equal(resolveMaxSnapshots({ SNAPSHOT_MAX_COUNT: value }), 500, `value ${value}`);
    }
  });
});
