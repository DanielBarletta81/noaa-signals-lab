import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCoverage, parseRawNoaaTime } from "../src/view/coverage.js";
import { formatCelsius, formatUtcAxis, formatUtcClock, formatUtcLong, describeSlot } from "../src/view/format.js";
import { describeEmpty, describeError } from "../src/view/states.js";

// SYNTHETIC inputs for presentation tests. These are not NOAA observations.
const point = (iso, value) => ({ time: iso, value });
const excludedRow = (raw, reason, rawValue = "") => ({ rawTimestamp: raw, reason, rawValue });

describe("parseRawNoaaTime", () => {
  it("converts NOAA's GMT text to an ISO instant", () => {
    assert.equal(parseRawNoaaTime("2026-11-13 23:00"), "2026-11-13T23:00:00.000Z");
  });

  it("rejects impossible dates, bad hours, and other formats", () => {
    for (const text of ["2026-02-29 12:00", "2026-11-13 24:00", "2026-11-13T23:00", "", null, 42]) {
      assert.equal(parseRawNoaaTime(text), null, String(text));
    }
  });

  it("is continuous across the US fall-back date, because GMT has no repeated hour", () => {
    assert.equal(parseRawNoaaTime("2026-11-01 01:00"), "2026-11-01T01:00:00.000Z");
    assert.equal(parseRawNoaaTime("2026-11-01 02:00"), "2026-11-01T02:00:00.000Z");
  });
});

describe("buildCoverage: each hour is observed, excluded, or missing", () => {
  it("classifies a six-hour window that has one observed hour, one excluded hour, and one missing hour", () => {
    // SYNTHETIC window 01:00 to 06:00 UTC. 04:00 is missing, 03:00 is excluded.
    const result = buildCoverage({
      series: [point("2026-11-13T01:00:00.000Z", 12), point("2026-11-13T02:00:00.000Z", 12.1),
        point("2026-11-13T05:00:00.000Z", 12.2), point("2026-11-13T06:00:00.000Z", 12.3)],
      excluded: [excludedRow("2026-11-13 03:00", "blank_value")],
      requestedHours: 6,
    });
    assert.deepEqual(result.slots.map((s) => s.status), ["observed", "observed", "excluded", "missing", "observed", "observed"]);
    assert.equal(result.slots[2].reason, "blank_value");
    assert.equal(result.start, "2026-11-13T01:00:00.000Z");
    assert.equal(result.end, "2026-11-13T06:00:00.000Z");
  });

  it("never marks an excluded hour as observed, so a blank reading is not a value", () => {
    const result = buildCoverage({
      series: [],
      excluded: [excludedRow("2026-11-13 10:00", "blank_value", "")],
      requestedHours: 1,
    });
    assert.equal(result.slots[0].status, "excluded");
    assert.equal(Object.hasOwn(result.slots[0], "value"), false, "no value is attached to an excluded slot");
  });

  it("gives an accepted point priority over an exclusion for the same hour (repeated timestamps)", () => {
    const result = buildCoverage({
      series: [point("2026-11-13T10:00:00.000Z", 12.1)],
      excluded: [excludedRow("2026-11-13 10:00", "duplicate_timestamp", "12.9")],
      requestedHours: 1,
    });
    assert.equal(result.slots[0].status, "observed");
    assert.equal(result.slots[0].value, 12.1);
  });

  it("uses the newest known row as the window end, including an excluded newest row", () => {
    const result = buildCoverage({
      series: [point("2026-11-13T05:00:00.000Z", 12)],
      excluded: [excludedRow("2026-11-13 06:00", "missing_value")],
      requestedHours: 2,
    });
    assert.equal(result.end, "2026-11-13T06:00:00.000Z");
    assert.deepEqual(result.slots.map((s) => s.status), ["observed", "excluded"]);
  });

  it("ignores exclusions whose timestamp text cannot be read, rather than placing them", () => {
    const result = buildCoverage({
      series: [point("2026-11-13T05:00:00.000Z", 12)],
      excluded: [excludedRow("2026-02-30 05:00", "malformed_timestamp"), excludedRow(null, "malformed_row")],
      requestedHours: 1,
    });
    assert.deepEqual(result.slots.map((s) => s.status), ["observed"]);
  });

  it("counts accepted or excluded rows that fall before the requested window", () => {
    const result = buildCoverage({
      series: [point("2026-11-01T00:00:00.000Z", 9), point("2026-11-13T05:00:00.000Z", 12)],
      excluded: [],
      requestedHours: 3,
    });
    assert.equal(result.outsideWindow, 1);
    assert.equal(result.slots.length, 3);
  });

  it("returns no slots for an empty response, and for a window length that is not a whole number of hours", () => {
    assert.deepEqual(buildCoverage({ series: [], excluded: [], requestedHours: 24 }).slots, []);
    assert.deepEqual(buildCoverage({ series: [point("2026-11-13T05:00:00.000Z", 12)], requestedHours: 0 }).slots, []);
    assert.deepEqual(buildCoverage({ series: [point("2026-11-13T05:00:00.000Z", 12)], requestedHours: 1.5 }).slots, []);
  });

  it("produces the full requested number of slots for a 72-hour window with sparse data", () => {
    const result = buildCoverage({
      series: [point("2026-11-14T00:00:00.000Z", 11.9)],
      excluded: [],
      requestedHours: 72,
    });
    assert.equal(result.slots.length, 72);
    assert.equal(result.slots.filter((s) => s.status === "missing").length, 71);
  });
});

describe("format helpers", () => {
  it("states UTC explicitly in long form", () => {
    assert.equal(formatUtcLong("2026-11-14T00:00:00.000Z"), "14 Nov 2026, 00:00 UTC");
    assert.equal(formatUtcLong("not a time"), "time not available");
  });

  it("labels midnight with its date on the axis and other hours with clock time only", () => {
    assert.equal(formatUtcAxis("2026-11-14T00:00:00.000Z"), "14 Nov 00:00");
    assert.equal(formatUtcAxis("2026-11-13T15:00:00.000Z"), "15:00");
    assert.equal(formatUtcClock("2026-11-13T07:30:00.000Z"), "07:30");
  });

  it("formats Celsius with the unit, and never invents a number for a missing value", () => {
    assert.equal(formatCelsius(11.9), "11.9 °C");
    assert.equal(formatCelsius(0), "0 °C", "a genuine zero is shown as zero");
    assert.equal(formatCelsius(undefined), "no value");
    assert.equal(formatCelsius(NaN), "no value");
  });
});

describe("describeSlot: accessible names say what happened, in full", () => {
  it("names an observed hour with its UTC time and value", () => {
    assert.equal(
      describeSlot({ iso: "2026-11-13T18:00:00.000Z", status: "observed", value: 11.9 }),
      "13 Nov 2026, 18:00 UTC: observed, 11.9 °C"
    );
  });

  it("names an excluded hour with its reason, and never gives it a value", () => {
    const name = describeSlot({ iso: "2026-11-13T10:00:00.000Z", status: "excluded", reason: "blank_value" });
    assert.equal(name, "13 Nov 2026, 10:00 UTC: row excluded (blank value), not plotted");
    assert.doesNotMatch(name, /°C/);
  });

  it("names a missing hour as no row returned, not as a zero or a gap of unknown cause", () => {
    const name = describeSlot({ iso: "2026-11-13T14:00:00.000Z", status: "missing" });
    assert.equal(name, "13 Nov 2026, 14:00 UTC: no row returned by NOAA");
  });
});

describe("describeError: each failure has its own explanation", () => {
  it("gives distinct titles for timeout, NOAA error, and unreachable NOAA", () => {
    const titles = ["upstream_timeout", "upstream_error", "upstream_unreachable"].map((c) => describeError(c).title);
    assert.equal(new Set(titles).size, 3);
    assert.match(titles[0], /did not respond in time/);
  });

  it("marks configuration and parameter errors as not retryable, and transient ones as retryable", () => {
    assert.equal(describeError("invalid_api_config").retryable, false);
    assert.equal(describeError("invalid_parameter").retryable, false);
    assert.equal(describeError("upstream_timeout").retryable, true);
    assert.equal(describeError("network_error").retryable, true);
  });

  it("falls back to a generic message for an unknown code without claiming the cause", () => {
    const state = describeError("something_new");
    assert.equal(state.retryable, true);
    assert.match(state.body, /No values are shown/);
  });

  it("never says a failure means the water was a particular temperature", () => {
    for (const code of ["upstream_timeout", "upstream_error", "network_error", "internal_error"]) {
      assert.doesNotMatch(describeError(code).body, /\bwarm|\bcold|\belevated|\bhealthy|\bharmful/i, code);
    }
  });
});

describe("describeEmpty: the three empty outcomes are different claims", () => {
  it("does not claim absence for NOAA's ambiguous no-data text", () => {
    const state = describeEmpty({ status: "empty", absenceStatus: "not_established" });
    assert.match(state.title, /reported no data/);
    assert.match(state.body, /does not claim the window was empty/);
    assert.doesNotMatch(state.title, /no observations/i);
  });

  it("states zero rows for a valid empty response", () => {
    const state = describeEmpty({ status: "empty", absenceStatus: "rows_absent_in_window" });
    assert.match(state.title, /returned no rows/);
  });

  it("says rows came back but were excluded, with the count, when none were usable", () => {
    const state = describeEmpty({ status: "no_valid_observations", quality: { receivedRows: 3 } });
    assert.match(state.body, /NOAA returned 3 rows/);
    assert.match(state.body, /never treated as zero/);
  });
});
