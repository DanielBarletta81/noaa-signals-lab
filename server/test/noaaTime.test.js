import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseNoaaGmtTimestamp } from "../src/time/noaaTime.js";

// Synthetic timestamp strings for unit tests. They are not NOAA observations.
describe("parseNoaaGmtTimestamp: valid GMT strings", () => {
  it("converts a standard hourly GMT string to an explicit UTC ISO instant", () => {
    const result = parseNoaaGmtTimestamp("2026-11-13 23:00");
    assert.equal(result.ok, true);
    assert.equal(result.iso, "2026-11-13T23:00:00.000Z");
  });

  it("keeps midnight at the start of the day (day start boundary)", () => {
    assert.equal(parseNoaaGmtTimestamp("2026-11-13 00:00").iso, "2026-11-13T00:00:00.000Z");
  });

  it("places 23:00 on one day and 00:00 on the next in the correct order (day boundary)", () => {
    const before = parseNoaaGmtTimestamp("2026-11-12 23:00").epochMs;
    const midnight = parseNoaaGmtTimestamp("2026-11-13 00:00").epochMs;
    assert.equal(midnight - before, 60 * 60 * 1000, "exactly one hour apart");
  });

  it("accepts the last hour of a month and the first hour of the next month", () => {
    assert.equal(parseNoaaGmtTimestamp("2026-11-30 23:00").iso, "2026-11-30T23:00:00.000Z");
    assert.equal(parseNoaaGmtTimestamp("2026-12-01 00:00").iso, "2026-12-01T00:00:00.000Z");
  });

  it("accepts Feb 29 in a leap year", () => {
    assert.equal(parseNoaaGmtTimestamp("2028-02-29 12:00").ok, true);
  });

  it("interprets the US fall-back date as unambiguous UTC (DST boundary)", () => {
    // 2026-11-01 01:30 occurs twice in US Eastern local time. In GMT it occurs once.
    const result = parseNoaaGmtTimestamp("2026-11-01 01:30");
    assert.equal(result.iso, "2026-11-01T01:30:00.000Z");
  });
});

describe("parseNoaaGmtTimestamp: invalid strings are rejected, not guessed", () => {
  it("rejects a day that does not exist in a non-leap year", () => {
    const result = parseNoaaGmtTimestamp("2026-02-29 12:00");
    assert.deepEqual(result, { ok: false, reason: "impossible_date" });
  });

  it("rejects a 30-day month's 31st", () => {
    assert.equal(parseNoaaGmtTimestamp("2026-04-31 00:00").reason, "impossible_date");
  });

  it("rejects hour 24 (NOAA uses 00:00 of the next day instead)", () => {
    assert.equal(parseNoaaGmtTimestamp("2026-11-13 24:00").reason, "out_of_range");
  });

  it("rejects minute 60", () => {
    assert.equal(parseNoaaGmtTimestamp("2026-11-13 10:60").reason, "out_of_range");
  });

  it("rejects month 13 and day 0", () => {
    assert.equal(parseNoaaGmtTimestamp("2026-13-01 00:00").reason, "out_of_range");
    assert.equal(parseNoaaGmtTimestamp("2026-11-00 00:00").reason, "out_of_range");
  });

  it("rejects ISO 8601 with a T separator (not NOAA's format)", () => {
    assert.equal(parseNoaaGmtTimestamp("2026-11-13T23:00").reason, "unexpected_format");
  });

  it("rejects non-zero-padded hours", () => {
    assert.equal(parseNoaaGmtTimestamp("2026-11-13 9:00").reason, "unexpected_format");
  });

  it("rejects a seconds field, which NOAA does not send for hourly data", () => {
    assert.equal(parseNoaaGmtTimestamp("2026-11-13 23:00:00").reason, "unexpected_format");
  });

  it("rejects other date formats", () => {
    assert.equal(parseNoaaGmtTimestamp("11/13/2026 23:00").reason, "unexpected_format");
    assert.equal(parseNoaaGmtTimestamp("2026/11/13 23:00").reason, "unexpected_format");
  });

  it("rejects empty strings and whitespace", () => {
    assert.equal(parseNoaaGmtTimestamp("").reason, "unexpected_format");
    assert.equal(parseNoaaGmtTimestamp("   ").reason, "unexpected_format");
  });

  it("rejects non-string input", () => {
    assert.equal(parseNoaaGmtTimestamp(undefined).reason, "not_a_string");
    assert.equal(parseNoaaGmtTimestamp(null).reason, "not_a_string");
    assert.equal(parseNoaaGmtTimestamp(1731538800000).reason, "not_a_string");
  });
});
