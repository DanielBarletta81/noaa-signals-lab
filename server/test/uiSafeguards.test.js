// Static safeguards for the active client UI.
//
// These tests read the source files that App.jsx actually renders (the .tsx
// components it imports, plus the hook). They fail if fabricated measurements,
// the retired Newport card, or the retired trend card come back.
//
// They do not prove the rendered page is correct. That needs a browser check.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ACTIVE_UI_FILES = [
  "../../client/src/App.jsx",
  "../../client/src/components/SummaryCards.tsx",
  "../../client/src/components/SignalChart.tsx",
  "../../client/src/components/InsightPanel.tsx",
  "../../client/src/hooks/useNoaaSignal.js",
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
  });

  it("does not contain the debug JSON dump in SignalChart", () => {
    assert.equal(source["../../client/src/components/SignalChart.tsx"].includes("<pre>"), false);
    assert.equal(source["../../client/src/components/SignalChart.tsx"].includes("JSON.stringify"), false);
  });

  it("does not hard-code a numeric reading in any display component", () => {
    // A bare number with a unit suffix in JSX text would be a literal measurement.
    const literal = /[>"`]\s*-?\d+(\.\d+)?\s*(°C|°F|C\b|F\b)/;
    for (const [path, text] of Object.entries(source)) {
      assert.equal(literal.test(text), false, `literal measurement in ${path}`);
    }
  });
});

describe("active UI keeps the scientific caveats visible", () => {
  it("states that quality flags are not yet interpreted", () => {
    assert.match(source["../../client/src/App.jsx"], /quality flags[\s\S]*not yet\s+scientifically interpreted/);
  });

  it("explains the NOAA no-data ambiguity", () => {
    assert.match(source["../../client/src/App.jsx"], /does not distinguish these cases/);
  });

  it("renders the limitations list from the server", () => {
    assert.match(source["../../client/src/components/InsightPanel.tsx"], /limitations\.map/);
  });

  it("labels chart times as UTC", () => {
    assert.match(source["../../client/src/components/SignalChart.tsx"], /Time \(UTC\)/);
  });
});
