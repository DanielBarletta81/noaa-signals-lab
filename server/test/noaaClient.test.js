import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyMeasurement,
  normalizeNoaaResponse,
  buildNoaaUrl,
  EXCLUSION_REASONS,
} from "../src/adapters/noaaClient.js";

const META = Object.freeze({
  station: "8454000",
  product: "water_temperature",
  sourceUrl: "https://example.test/synthetic",
  retrievedAt: "2026-11-13T23:51:00.000Z",
});

// Builds a NOAA-shaped payload from synthetic rows. Not an observation record.
function payloadWith(rows, extra = {}) {
  return { metadata: { id: "8454000", name: "Providence" }, data: rows, ...extra };
}

describe("classifyMeasurement: genuine numeric values are kept", () => {
  it("keeps a positive numeric string", () => {
    assert.deepEqual(classifyMeasurement("11.9"), { ok: true, value: 11.9 });
  });

  it("keeps a genuine zero written as text", () => {
    assert.deepEqual(classifyMeasurement("0"), { ok: true, value: 0 });
    assert.deepEqual(classifyMeasurement("0.0"), { ok: true, value: 0 });
    assert.deepEqual(classifyMeasurement(".0"), { ok: true, value: 0 });
  });

  it("keeps a genuine zero passed as a number", () => {
    assert.deepEqual(classifyMeasurement(0), { ok: true, value: 0 });
  });

  it("keeps negative values, which are physically possible in cold water", () => {
    assert.deepEqual(classifyMeasurement("-0.5"), { ok: true, value: -0.5 });
  });

  it("converts negative zero to plain zero", () => {
    const result = classifyMeasurement("-0");
    assert.equal(result.ok, true);
    assert.equal(Object.is(result.value, 0), true);
  });

  it("tolerates surrounding whitespace around a number", () => {
    assert.deepEqual(classifyMeasurement(" 12.4 "), { ok: true, value: 12.4 });
  });
});

describe("classifyMeasurement: missing, blank, and malformed values are never zero", () => {
  it("reports an undefined value as missing", () => {
    assert.deepEqual(classifyMeasurement(undefined), { ok: false, reason: "missing_value" });
  });

  it("reports a null value as missing", () => {
    assert.deepEqual(classifyMeasurement(null), { ok: false, reason: "missing_value" });
  });

  it("reports an empty string as blank, not zero", () => {
    assert.deepEqual(classifyMeasurement(""), { ok: false, reason: "blank_value" });
  });

  it("reports a whitespace-only string as blank, not zero", () => {
    assert.deepEqual(classifyMeasurement("   "), { ok: false, reason: "blank_value" });
  });

  it("reports non-numeric text as malformed", () => {
    for (const text of ["abc", "12abc", "1,2", "1e3", "NaN", "Infinity", "-", "."]) {
      assert.deepEqual(
        classifyMeasurement(text),
        { ok: false, reason: "malformed_value" },
        `value ${JSON.stringify(text)}`
      );
    }
  });

  it("reports a boolean or object as malformed", () => {
    assert.equal(classifyMeasurement(true).reason, "malformed_value");
    assert.equal(classifyMeasurement({}).reason, "malformed_value");
    assert.equal(classifyMeasurement([12]).reason, "malformed_value");
  });

  it("reports NaN and Infinity numbers as non-finite", () => {
    assert.equal(classifyMeasurement(NaN).reason, "non_finite_value");
    assert.equal(classifyMeasurement(Infinity).reason, "non_finite_value");
    assert.equal(classifyMeasurement(-Infinity).reason, "non_finite_value");
  });
});

describe("normalizeNoaaResponse: row exclusion and reporting", () => {
  it("keeps valid rows and excludes blank, null, missing, and malformed values with counts", () => {
    const payload = payloadWith([
      { t: "2026-11-13 10:00", v: "12.0", f: "0,0,0" },
      { t: "2026-11-13 11:00", v: "" },
      { t: "2026-11-13 12:00", v: null },
      { t: "2026-11-13 13:00" },
      { t: "2026-11-13 14:00", v: "abc" },
      { t: "2026-11-13 15:00", v: "12.5", f: "0,0,0" },
    ]);

    const result = normalizeNoaaResponse(payload, META);

    assert.equal(result.status, "ok");
    assert.deepEqual(
      result.points.map((p) => p.value),
      [12.0, 12.5],
      "only the two numeric rows become points"
    );
    assert.equal(result.quality.receivedRows, 6);
    assert.equal(result.quality.acceptedRows, 2);
    assert.equal(result.quality.excludedRows, 4);
    assert.equal(result.quality.excludedByReason.blank_value, 1);
    assert.equal(result.quality.excludedByReason.missing_value, 2);
    assert.equal(result.quality.excludedByReason.malformed_value, 1);
  });

  it("excludes a non-finite numeric value (NaN) and reports it as non_finite_value", () => {
    const result = normalizeNoaaResponse(
      payloadWith([
        { t: "2026-11-13 10:00", v: NaN },
        { t: "2026-11-13 11:00", v: "12.2" },
      ]),
      META
    );
    assert.deepEqual(result.points.map((p) => p.value), [12.2]);
    assert.equal(result.quality.excludedByReason.non_finite_value, 1);
  });

  it("never emits a point with value 0 for a blank or null reading", () => {
    const payload = payloadWith([
      { t: "2026-11-13 10:00", v: "" },
      { t: "2026-11-13 11:00", v: null },
      { t: "2026-11-13 12:00", v: "   " },
    ]);
    const result = normalizeNoaaResponse(payload, META);
    assert.equal(result.points.length, 0);
    assert.equal(result.status, "no_valid_observations");
    assert.equal(result.quality.excludedByReason.blank_value, 2);
    assert.equal(result.quality.excludedByReason.missing_value, 1);
  });

  it("keeps a genuine 0.0 reading as a point and counts it as accepted", () => {
    const payload = payloadWith([
      { t: "2026-11-13 10:00", v: "0.0", f: "0,0,0" },
      { t: "2026-11-13 11:00", v: "" },
    ]);
    const result = normalizeNoaaResponse(payload, META);
    assert.equal(result.points.length, 1);
    assert.equal(result.points[0].value, 0);
    assert.equal(result.points[0].rawValue, "0.0", "raw text is preserved");
    assert.equal(result.quality.acceptedRows, 1);
  });

  it("preserves the original NOAA timestamp string and the raw value text", () => {
    const result = normalizeNoaaResponse(
      payloadWith([{ t: "2026-11-13 23:00", v: "11.9", f: "0,0,0" }]),
      META
    );
    const [point] = result.points;
    assert.equal(point.observedAtRaw, "2026-11-13 23:00");
    assert.equal(point.timestampUtc, "2026-11-13T23:00:00.000Z");
    assert.equal(point.rawValue, "11.9");
    assert.equal(point.station, "8454000");
    assert.equal(point.product, "water_temperature");
  });

  it("preserves quality flags verbatim and reports q as null when absent", () => {
    const result = normalizeNoaaResponse(
      payloadWith([
        { t: "2026-11-13 10:00", v: "12.0", f: "0,0,0" },
        { t: "2026-11-13 11:00", v: "12.1", f: "1,0,0", q: "p" },
      ]),
      META
    );
    assert.deepEqual(result.points[0].flags, { quality: null, flag: "0,0,0" });
    assert.deepEqual(result.points[1].flags, { quality: "p", flag: "1,0,0" });
  });

  it("does not drop flagged rows: flags are preserved, not used as exclusion", () => {
    const result = normalizeNoaaResponse(
      payloadWith([{ t: "2026-11-13 10:00", v: "12.0", f: "1,1,1", q: "x" }]),
      META
    );
    assert.equal(result.points.length, 1);
    assert.equal(result.quality.excludedRows, 0);
  });

  it("excludes a row that is not an object and reports it as malformed_row", () => {
    const result = normalizeNoaaResponse(payloadWith([null, "12.0", ["12.0"]]), META);
    assert.equal(result.points.length, 0);
    assert.equal(result.quality.excludedByReason.malformed_row, 3);
  });

  it("excludes a row with a malformed timestamp and keeps a record of it", () => {
    const result = normalizeNoaaResponse(
      payloadWith([
        { t: "2026-02-30 10:00", v: "12.0" },
        { t: "2026-11-13T10:00", v: "12.1" },
        { t: "2026-11-13 10:00", v: "12.2" },
      ]),
      META
    );
    assert.equal(result.points.length, 1);
    assert.equal(result.quality.excludedByReason.malformed_timestamp, 2);
    assert.equal(result.quality.excluded[0].rawTimestamp, "2026-02-30 10:00");
    assert.equal(result.quality.excluded[0].rawValue, "12.0");
  });

  it("uses EXCLUSION_REASONS as the stable set of reason keys", () => {
    const result = normalizeNoaaResponse(payloadWith([]), META);
    assert.deepEqual(Object.keys(result.quality.excludedByReason), [...EXCLUSION_REASONS]);
    assert.ok(Object.values(result.quality.excludedByReason).every((n) => n === 0));
  });
});

describe("normalizeNoaaResponse: ordering and duplicates", () => {
  it("sorts out-of-order rows by parsed UTC time", () => {
    const result = normalizeNoaaResponse(
      payloadWith([
        { t: "2026-11-13 12:00", v: "12.3" },
        { t: "2026-11-13 10:00", v: "12.1" },
        { t: "2026-11-13 11:00", v: "12.2" },
      ]),
      META
    );
    assert.deepEqual(
      result.points.map((p) => p.timestampUtc),
      ["2026-11-13T10:00:00.000Z", "2026-11-13T11:00:00.000Z", "2026-11-13T12:00:00.000Z"]
    );
  });

  it("orders across a day boundary correctly", () => {
    const result = normalizeNoaaResponse(
      payloadWith([
        { t: "2026-11-14 00:00", v: "11.9" },
        { t: "2026-11-13 23:00", v: "12.0" },
      ]),
      META
    );
    assert.deepEqual(
      result.points.map((p) => p.observedAtRaw),
      ["2026-11-13 23:00", "2026-11-14 00:00"]
    );
  });

  it("keeps the first row for a repeated instant and reports the later one as a duplicate", () => {
    const result = normalizeNoaaResponse(
      payloadWith([
        { t: "2026-11-13 10:00", v: "12.1" },
        { t: "2026-11-13 10:00", v: "12.9" },
        { t: "2026-11-13 11:00", v: "12.2" },
      ]),
      META
    );
    assert.deepEqual(result.points.map((p) => p.value), [12.1, 12.2]);
    assert.equal(result.quality.excludedByReason.duplicate_timestamp, 1);
    assert.equal(result.quality.excluded.find((e) => e.reason === "duplicate_timestamp").rawValue, "12.9");
  });
});

describe("normalizeNoaaResponse: empty and no-data outcomes", () => {
  it("returns status empty for a valid response with zero rows", () => {
    const result = normalizeNoaaResponse(payloadWith([]), META);
    assert.equal(result.status, "empty");
    assert.equal(result.points.length, 0);
    assert.equal(result.quality.receivedRows, 0);
  });

  it("returns status empty for NOAA's documented no-data message, keeping the message", () => {
    const result = normalizeNoaaResponse(
      {
        error: {
          message:
            "No data was found. This product may not be offered at this station at the requested time.",
        },
      },
      META
    );
    assert.equal(result.status, "empty");
    assert.equal(result.points.length, 0);
    assert.match(result.noaaMessage, /^No data was found/);
  });
});

describe("normalizeNoaaResponse: upstream payload shape problems", () => {
  it("throws an upstream error when the data array is missing", () => {
    assert.throws(
      () => normalizeNoaaResponse({ metadata: {} }, META),
      (error) => error.code === "upstream_error" && error.status === 502
    );
  });

  it("throws an upstream error when data is not an array", () => {
    assert.throws(
      () => normalizeNoaaResponse({ data: { t: "x" } }, META),
      (error) => error.code === "upstream_error"
    );
  });

  it("throws an upstream error for an unexpected NOAA error message", () => {
    assert.throws(
      () =>
        normalizeNoaaResponse(
          { error: { message: " Wrong Range: The Range is a number" } },
          META
        ),
      (error) =>
        error.code === "upstream_error" &&
        error.details.noaaMessage === "Wrong Range: The Range is a number"
    );
  });

  it("throws an upstream error for a null payload", () => {
    assert.throws(() => normalizeNoaaResponse(null, META), { code: "upstream_error" });
  });
});

describe("normalizeNoaaResponse: no-data classification is explicit and conservative", () => {
  it("classifies NOAA's exact no-data text as empty with emptyReason noaa_no_data_message", () => {
    const result = normalizeNoaaResponse(
      { error: { message: "No data was found. This product may not be offered at this station at the requested time." } },
      META
    );
    assert.equal(result.status, "empty");
    assert.equal(result.emptyReason, "noaa_no_data_message");
    assert.match(result.noaaMessage, /may not be offered at this station/);
  });

  it("matches the captured NOAA no-data fixture text", () => {
    const payload = JSON.parse(
      readFileSync(new URL("./fixtures/noaa-8454000-water_temperature-nodata-2030.json", import.meta.url), "utf8")
    );
    const result = normalizeNoaaResponse(payload, META);
    assert.equal(result.emptyReason, "noaa_no_data_message");
  });

  it("does not treat near-miss wording as empty; it is an upstream error", () => {
    for (const message of [
      "No data found for this station.",
      "no data was found",
      "Data was not found.",
      "Wrong Range: The Range is a number",
    ]) {
      assert.throws(
        () => normalizeNoaaResponse({ error: { message } }, META),
        (error) => error.code === "upstream_error",
        `message: ${message}`
      );
    }
  });

  it("reports emptyReason no_rows_returned when NOAA returns an empty data array", () => {
    const result = normalizeNoaaResponse({ data: [] }, META);
    assert.equal(result.status, "empty");
    assert.equal(result.emptyReason, "no_rows_returned");
  });

  it("sets absenceStatus not_established for NOAA no-data text, so no empty-window claim is made", () => {
    const result = normalizeNoaaResponse(
      { error: { message: "No data was found. This product may not be offered at this station at the requested time." } },
      META
    );
    assert.equal(result.absenceStatus, "not_established");
    assert.notEqual(result.absenceStatus, "rows_absent_in_window");
  });

  it("sets absenceStatus rows_absent_in_window only for a valid response with zero rows", () => {
    assert.equal(normalizeNoaaResponse({ data: [] }, META).absenceStatus, "rows_absent_in_window");
  });

  it("sets absenceStatus null when observations or excluded rows were returned", () => {
    assert.equal(
      normalizeNoaaResponse({ data: [{ t: "2026-11-13 10:00", v: "12.0" }] }, META).absenceStatus,
      null
    );
    assert.equal(
      normalizeNoaaResponse({ data: [{ t: "2026-11-13 10:00", v: "" }] }, META).absenceStatus,
      null
    );
  });

  it("makes no absence claim for an unexpected NOAA error, which is an upstream failure instead", () => {
    assert.throws(
      () => normalizeNoaaResponse({ error: { message: "Wrong Range: The Range is a number" } }, META),
      (error) => error.code === "upstream_error"
    );
  });

  it("reports emptyReason null when points are present or every row was excluded", () => {
    assert.equal(
      normalizeNoaaResponse({ data: [{ t: "2026-11-13 10:00", v: "12.0" }] }, META).emptyReason,
      null
    );
    const allExcluded = normalizeNoaaResponse({ data: [{ t: "2026-11-13 10:00", v: "" }] }, META);
    assert.equal(allExcluded.status, "no_valid_observations");
    assert.equal(allExcluded.emptyReason, null);
  });
});

describe("normalizeNoaaResponse: quality flags are preserved and declared uninterpreted", () => {
  it("declares flagPolicy preserved_not_interpreted on a successful result", () => {
    const result = normalizeNoaaResponse(
      { data: [{ t: "2026-11-13 10:00", v: "12.0", f: "1,1,1", q: "x" }] },
      META
    );
    assert.equal(result.quality.flagPolicy, "preserved_not_interpreted");
    assert.equal(result.points[0].flags.flag, "1,1,1");
    assert.equal(result.points[0].flags.quality, "x");
  });

  it("declares the same flagPolicy on empty and no-data results", () => {
    assert.equal(normalizeNoaaResponse({ data: [] }, META).quality.flagPolicy, "preserved_not_interpreted");
    assert.equal(
      normalizeNoaaResponse({ error: { message: "No data was found." } }, META).quality.flagPolicy,
      "preserved_not_interpreted"
    );
  });
});

describe("buildNoaaUrl: request contract", () => {
  it("requests GMT timestamps, metric units, JSON, and hourly interval", () => {
    const url = new URL(
      buildNoaaUrl({ station: "8454000", product: "water_temperature", range: 24 })
    );
    assert.equal(url.origin + url.pathname, "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
    assert.equal(url.searchParams.get("time_zone"), "gmt");
    assert.equal(url.searchParams.get("units"), "metric");
    assert.equal(url.searchParams.get("format"), "json");
    assert.equal(url.searchParams.get("interval"), "h");
    assert.equal(url.searchParams.get("range"), "24");
    assert.equal(url.searchParams.get("station"), "8454000");
    assert.equal(url.searchParams.get("product"), "water_temperature");
  });
});
