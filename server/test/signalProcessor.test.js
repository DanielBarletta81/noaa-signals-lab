import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processSignal, TREND_SUPPRESSED } from "../src/pipeline/signalProcessor.js";
import { createSignalInsight, INSIGHT_LIMITATIONS } from "../src/pipeline/insightEngine.js";

// SYNTHETIC TEST DATA. These points are invented for arithmetic checks and are
// not NOAA observations.
function syntheticPoints(values) {
  return values.map((value, index) => ({
    station: "8454000",
    product: "water_temperature",
    timestampUtc: new Date(Date.UTC(2026, 10, 13, index)).toISOString(),
    observedAtRaw: `2026-11-13 ${String(index).padStart(2, "0")}:00`,
    value,
    rawValue: String(value),
    flags: { quality: null, flag: "0,0,0" },
  }));
}

describe("processSignal: empty input", () => {
  it("returns no summary, no series, and a suppressed trend for zero points", () => {
    const result = processSignal([]);
    assert.equal(result.latest, null);
    assert.deepEqual(result.series, []);
    assert.equal(result.summary, null);
    assert.equal(result.trend, TREND_SUPPRESSED);
    assert.match(result.insight, /No valid NOAA observations/);
  });
});

describe("processSignal: summary arithmetic on synthetic values", () => {
  it("computes latest, min, max, average, and count", () => {
    // SYNTHETIC: [12.0, 12.4, 11.6]. Mean = 36.0 / 3 = 12.00.
    const { summary } = processSignal(syntheticPoints([12.0, 12.4, 11.6]));
    assert.equal(summary.latestValue, 11.6);
    assert.equal(summary.min, 11.6);
    assert.equal(summary.max, 12.4);
    assert.equal(summary.average, 12);
    assert.equal(summary.count, 3);
  });

  it("reports the UTC timestamp of the latest accepted observation", () => {
    const { summary } = processSignal(syntheticPoints([1, 2, 3]));
    assert.equal(summary.latestTimestampUtc, "2026-11-13T02:00:00.000Z");
  });

  it("includes genuine zeros in min, max, average, and count", () => {
    // SYNTHETIC: [0, 0, 2]. Mean = 2/3 = 0.67 after rounding.
    const { summary } = processSignal(syntheticPoints([0, 0, 2]));
    assert.equal(summary.min, 0);
    assert.equal(summary.max, 2);
    assert.equal(summary.average, 0.67);
    assert.equal(summary.count, 3);
  });

  it("returns a single-point summary without errors", () => {
    const { summary, series } = processSignal(syntheticPoints([9.5]));
    assert.equal(summary.count, 1);
    assert.equal(summary.min, 9.5);
    assert.equal(summary.max, 9.5);
    assert.equal(series.length, 1);
  });
});

describe("processSignal: the misleading last-step trend is suppressed", () => {
  it("does not emit a change field or a rising/falling/stable label", () => {
    // SYNTHETIC: the old code would label this as "stable" (last step is 0.0)
    // even though the window rose by 0.4 °C.
    const result = processSignal(syntheticPoints([10.0, 10.0, 10.0, 10.0, 10.4, 10.4]));
    assert.equal(Object.hasOwn(result.summary, "change"), false);
    assert.equal(Object.hasOwn(result.summary, "trend"), false);
    assert.equal(result.trend.status, "suppressed");
    assert.match(result.trend.reason, /not been calculated yet/);
  });

  it("does not use a trend word in the insight text", () => {
    const result = processSignal(syntheticPoints([10.0, 10.4]));
    assert.doesNotMatch(result.insight, /trend|rising|falling|stable/i);
  });
});

describe("processSignal: series and latest", () => {
  it("builds the series from timestampUtc and value only", () => {
    const { series } = processSignal(syntheticPoints([5, 6]));
    assert.deepEqual(series, [
      { time: "2026-11-13T00:00:00.000Z", value: 5 },
      { time: "2026-11-13T01:00:00.000Z", value: 6 },
    ]);
  });
});

describe("createSignalInsight: neutral, evidence-based wording", () => {
  // Words that would be judgments or ecological claims. The insight must not use them.
  const JUDGEMENT_PATTERN =
    /\b(elevated|low|moderate|healthy|harmful|stress\w*|oxygen|metabolic|feeding|habitat|unusual|normal|warm|cool|risk|bloom|migrat\w*|suitable|threat\w*)\b/i;

  function insightFor(values) {
    const processed = processSignal(syntheticPoints(values));
    return processed.insight;
  }

  it("does not change its wording at 26 °C, 8 °C, or any other value (no hidden thresholds)", () => {
    // The measured-values sentence is checked. The trailing disclaimer names the
    // judgements it refuses to make, so it is excluded from the check.
    for (const value of [0, 8, 12, 26, 35]) {
      const measured = insightFor([value - 1, value]).split(" These are measured values.")[0];
      assert.doesNotMatch(measured, JUDGEMENT_PATTERN, `value ${value}: ${measured}`);
    }
  });

  it("restates the latest value with its UTC time and the station", () => {
    // SYNTHETIC: three hourly values starting at 00:00 UTC; latest is 02:00 UTC.
    const insight = insightFor([12.0, 12.4, 11.6]);
    assert.match(insight, /Latest accepted observation: 11\.6 °C at 2026-11-13 02:00 UTC/);
    assert.match(insight, /NOAA station 8454000/);
  });

  it("states the window's count, minimum, maximum, and mean from the accepted points", () => {
    const insight = insightFor([12.0, 12.4, 11.6]);
    assert.match(insight, /Across the 3 accepted observations/);
    assert.match(insight, /ranged from 11\.6 °C to 12\.4 °C, with a mean of 12 °C/);
  });

  it("uses singular grammar for a single observation", () => {
    assert.match(insightFor([9.5]), /Across the 1 accepted observation in this window/);
  });

  it("states that the summary does not judge or infer ecological effects", () => {
    const insight = insightFor([12.0, 12.4]);
    assert.match(insight, /does not judge them as healthy, harmful, elevated, or unusual/);
    assert.match(insight, /does not infer ecological effects/);
  });

  it("gives a generic non-interpretive statement for any product other than water temperature", () => {
    const insight = createSignalInsight({ product: "salinity", station: "8454000", latest: null, summary: null });
    assert.equal(insight, "Measured values for this product are listed without interpretation.");
  });
});

describe("processSignal: limitations are always returned", () => {
  it("includes the flag caveat and the no-trend caveat for non-empty output", () => {
    const { limitations } = processSignal(syntheticPoints([10, 11]));
    assert.ok(limitations.some((text) => /quality flags.*not yet scientifically interpreted/.test(text)));
    assert.ok(limitations.some((text) => /No time-window trend/.test(text)));
    assert.ok(limitations.some((text) => /never treated as zero/.test(text)));
  });

  it("includes the same limitations for empty output", () => {
    assert.equal(processSignal([]).limitations, INSIGHT_LIMITATIONS);
  });
});
