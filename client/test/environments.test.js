import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Tests for the three knowledge environments: instrument, field note, and lab bench.
// They read the stylesheets and components, so they fail if a texture moves behind text,
// an alarm colour is introduced, or an environment stops being applied.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const indexCss = read("../src/index.css");
const envCss = read("../src/environments.css");

function token(css, name) {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  assert.ok(match, `token --${name} is defined as a 6-digit hex colour`);
  return match[1];
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe("environment text contrast (WCAG 2.x)", () => {
  it("field-note body text (paper ink) on the paper surface is at least 7:1", () => {
    assert.ok(contrast(token(envCss, "paper-ink"), token(envCss, "paper-surface")) >= 7);
  });

  it("field-note labels (pencil) on the paper surface are at least 4.5:1", () => {
    assert.ok(contrast(token(envCss, "paper-pencil"), token(envCss, "paper-surface")) >= 4.5);
  });

  it("lab-bench secondary text (muted) on the lab surface is at least 4.5:1", () => {
    assert.ok(contrast(token(indexCss, "muted"), token(envCss, "lab-surface")) >= 4.5);
  });

  it("instrument numerals on the instrument surface are at least 7:1", () => {
    assert.ok(contrast(token(indexCss, "numeral"), token(indexCss, "ink-0")) >= 7);
  });
});

describe("texture never sits behind body text or the chart", () => {
  it("the chart frame has no background texture or gradient", () => {
    const rule = /\.chart-frame\s*\{([^}]*)\}/.exec(indexCss)[1];
    assert.doesNotMatch(rule, /background|gradient|pattern/);
  });

  it("ruled lines are confined to the 14 px header band, not to the panel body", () => {
    const band = /\.panel--field::before[\s\S]*?\}/.exec(envCss)[0];
    assert.match(band, /height:\s*14px/);
    const body = /\.panel--field\s*\{[^}]*\}/.exec(envCss)[0];
    assert.doesNotMatch(body, /repeating-linear-gradient/);
  });

  it("the brackish wipe is a corner smudge kept inside its panel, so it cannot widen the page", () => {
    const wipe = /\.panel--field::after[\s\S]*?\}/.exec(envCss)[0];
    assert.match(wipe, /right:\s*0;/);
    assert.match(wipe, /bottom:\s*0;/);
    assert.doesNotMatch(wipe, /(right|bottom|left|top):\s*-\d/, "no negative offsets outside the panel");
    assert.match(wipe, /radial-gradient\(closest-side/);
  });

  it("the field-note clip removes a corner, and blurs nothing", () => {
    assert.match(envCss, /clip-path:\s*polygon\(16px 0/);
    assert.doesNotMatch(envCss, /backdrop-filter|blur\(/);
  });
});

describe("no alarm styling in the environment layer", () => {
  it("uses none of the warning or danger colours from the palette", () => {
    for (const hex of ["#ef4444", "#f59e0b", "#22c55e", "#fca5a5", "#fde68a"]) {
      assert.equal(envCss.toLowerCase().includes(hex), false, `environments.css uses ${hex}`);
    }
  });

  it("uses no warning icons, hazard stripes, or flashing", () => {
    assert.doesNotMatch(envCss, /animation-iteration-count:\s*infinite/);
    assert.doesNotMatch(envCss, /hazard|warning|danger/i);
  });
});

describe("each environment is applied in the components", () => {
  const components = {
    instrument: [
      ["../src/components/SummaryCards.tsx", "panel--instrument"],
      ["../src/components/Readout.jsx", 'readout--${variant}'],
    ],
    fieldNote: [
      ["../src/components/InsightPanel.tsx", "panel--field"],
      ["../src/components/StatePanel.jsx", "panel--field"],
      ["../src/components/Readout.jsx", "field-tag"],
    ],
    labBench: [
      ["../src/components/QualityPanel.jsx", "panel--lab"],
      ["../src/components/MethodPanel.jsx", "panel--lab"],
    ],
  };

  for (const [environment, pairs] of Object.entries(components)) {
    for (const [path, marker] of pairs) {
      it(`${environment}: ${path.split("/").pop()} carries ${marker}`, () => {
        assert.ok(read(path).includes(marker), `${path} does not include ${marker}`);
      });
    }
  }

  it("the journey line names the three environments in order", () => {
    const app = read("../src/App.jsx");
    assert.match(app, /Instrument: measurement[\s\S]*Field note: observation[\s\S]*Lab bench: interpretation/);
  });

  it("the chart animates once, so selecting an hour does not make the series disappear", () => {
    const chart = read("../src/components/SignalChart.tsx");
    assert.match(chart, /hasAnimated\.current = true/);
    assert.match(chart, /isAnimationActive=\{animate\}/);
  });

  it("a selected hour is shown as a field note, and the latest value as an instrument plate", () => {
    const app = read("../src/App.jsx");
    assert.match(app, /variant=\{selectedSlot \? "field" : "instrument"\}/);
  });
});
