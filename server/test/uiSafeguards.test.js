// Static safeguards for the active client UI.
//
// These tests read every source file that the rendered page can reach (the App, the
// components it imports, the hook, and the view helpers). They fail if fabricated
// measurements, the retired Newport card, the retired trend card, or the debug dump
// come back, and if a required scientific caveat disappears from every active file.
//
// They do not prove the rendered page is correct. Browser checks (screenshots and
// axe-core) are a separate verification step and are reported as such.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ACTIVE_UI_FILES = [
  "../../client/src/App.jsx",
  "../../client/src/components/Readout.jsx",
  "../../client/src/components/CoverageTimeline.jsx",
  "../../client/src/components/StatePanel.jsx",
  "../../client/src/components/QualityPanel.jsx",
  "../../client/src/components/MethodPanel.jsx",
  "../../client/src/components/DataTable.jsx",
  "../../client/src/components/SummaryCards.tsx",
  "../../client/src/components/SignalChart.tsx",
  "../../client/src/components/InsightPanel.tsx",
  "../../client/src/hooks/useNoaaSignal.js",
  "../../client/src/view/format.js",
  "../../client/src/view/states.js",
  "../../client/src/view/coverage.js",
  "../../client/src/view/motion.js",
];

const source = Object.fromEntries(
  ACTIVE_UI_FILES.map((path) => [path, readFileSync(new URL(path, import.meta.url), "utf8")])
);

const allSource = Object.values(source).join("\n");

describe("active UI contains no hard-coded measurements or fabricated station content", () => {
  // Strings from the retired LocationData.tsx. They were not NOAA data.
  const FABRICATED = [
    "Newport Harbor",
    "58.4",
    "+1.2",
    "Change exceeds baseline drift",
    "Signal Trend",
    "Watch",
  ];

  for (const text of FABRICATED) {
    it(`does not contain "${text}"`, () => {
      assert.equal(allSource.includes(text), false, `found "${text}" in an active UI file`);
    });
  }

  it("does not import or render LocationData", () => {
    assert.equal(allSource.includes("LocationData"), false);
  });

  it("does not render the retired Trend card", () => {
    assert.equal(source["../../client/src/components/SummaryCards.tsx"].includes('label="Trend"'), false);
    assert.equal(allSource.includes(">Trend<"), false);
  });

  it("does not contain the debug JSON dump anywhere in the active UI", () => {
    assert.equal(allSource.includes("<pre>"), false);
    assert.equal(allSource.includes("JSON.stringify"), false);
  });

  it("does not hard-code a numeric reading in any display file", () => {
    // A bare number with a unit suffix in JSX text would be a literal measurement.
    const literal = /[>"`]\s*-?\d+(\.\d+)?\s*(°C|°F|C\b|F\b)/;
    for (const [path, text] of Object.entries(source)) {
      assert.equal(literal.test(text), false, `literal measurement in ${path}`);
    }
  });

  it("the timeline and readout never attach a value to an excluded or missing hour", () => {
    // Only observed slots carry a value; describeSlot and the readout gate on the status.
    const format = source["../../client/src/view/format.js"];
    assert.match(format, /if \(slot\.status === "observed"\) return `\$\{when\}: observed, \$\{formatCelsius\(slot\.value\)\}`/);
    const app = source["../../client/src/App.jsx"];
    assert.match(app, /if \(slot\.status === "excluded"\)[\s\S]*value: null/);
    assert.match(app, /NOAA returned no row for this hour\. No value is shown/);
  });
});

describe("active UI keeps the scientific caveats visible", () => {
  it("states that quality flags are not yet interpreted", () => {
    assert.match(allSource, /quality flags[\s\S]*not yet\s+scientifically interpreted/);
  });

  it("explains the NOAA no-data ambiguity and does not claim absence", () => {
    assert.match(allSource, /NOAA's response does not distinguish these cases/);
    assert.match(allSource, /does not claim the window was empty/);
  });

  it("renders the limitations list from the server", () => {
    assert.match(source["../../client/src/components/InsightPanel.tsx"], /limitations\.map/);
  });

  it("labels chart values and times as UTC and °C", () => {
    assert.match(source["../../client/src/components/SignalChart.tsx"], /\(°C, UTC\)/);
    assert.match(source["../../client/src/components/SignalChart.tsx"], /type="linear"/, "segments join measured hours, with no interpolated curve");
  });

  it("states that the window start and end are inferred, not confirmed by NOAA", () => {
    assert.match(allSource, /inferred from the requested range, not confirmed by NOAA/);
  });

  it("states that no trend is calculated", () => {
    assert.match(allSource, /not calculated/i);
  });
});
