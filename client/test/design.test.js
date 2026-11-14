import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// WCAG 2.x contrast. Reads the palette from the stylesheet itself, so a changed token
// that drops below the threshold fails this test, rather than relying on a screenshot.

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

function token(name) {
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

describe("palette contrast (WCAG 2.x)", () => {
  it("body text on panels is at least 4.5:1 (AA normal text)", () => {
    assert.ok(contrast(token("text"), token("ink-1")) >= 4.5);
  });

  it("secondary (muted) text on panels is at least 4.5:1", () => {
    assert.ok(contrast(token("muted"), token("ink-1")) >= 4.5);
  });

  it("the measured numerals on the page background are at least 7:1", () => {
    assert.ok(contrast(token("numeral"), token("ink-0")) >= 7);
  });

  it("the observed-value colour on panels is at least 3:1 (non-text graphics)", () => {
    assert.ok(contrast(token("sea"), token("ink-1")) >= 3);
  });

  it("the excluded-hour colour on panels is at least 3:1, so hatched hours are visible", () => {
    assert.ok(contrast(token("clay"), token("ink-1")) >= 3);
  });

  it("the focus ring is at least 3:1 against the page background", () => {
    assert.ok(contrast(token("focus"), token("ink-0")) >= 3);
  });

  it("the clay text used for excluded notes is at least 4.5:1 on panels", () => {
    assert.ok(contrast(token("clay"), token("ink-1")) >= 4.5, "clay also carries excluded-state text");
  });
});

describe("stylesheet guarantees for accessibility and motion", () => {
  it("defines a visible focus ring for keyboard users", () => {
    assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px solid/);
  });

  it("disables transitions and animation under prefers-reduced-motion", () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration:\s*0\.01ms/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration:\s*0\.01ms/);
  });

  it("uses no gradient or blur for panel surfaces (flat ruled panels)", () => {
    const panelRule = /\.panel\s*\{[^}]*\}/.exec(css)[0];
    assert.doesNotMatch(panelRule, /gradient|blur/);
    assert.doesNotMatch(css, /backdrop-filter/);
  });

  it("gives excluded hours a hatched pattern, so the state is not conveyed by colour alone", () => {
    assert.match(css, /\.cell-excluded\s*\{[^}]*repeating-linear-gradient/);
  });

  it("keeps every timeline hour at least 24 CSS px wide on phones (WCAG 2.2 target size)", () => {
    const mobile = /@media \(max-width: 699px\)[\s\S]*?\n\}/.exec(css)[0];
    assert.match(mobile, /\.cell\s*\{[^}]*min-width:\s*24px/);
  });

  it("gives missing hours a dashed outline, a shape distinct from observed and excluded hours", () => {
    assert.match(css, /\.cell-missing\s*\{[^}]*dashed/);
  });
});
