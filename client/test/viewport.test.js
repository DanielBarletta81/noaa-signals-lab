import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PHONE_MAX_WIDTH, PHONE_QUERY, isPhoneWidth, prefersPhoneLayout } from "../src/view/viewport.js";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

describe("phone breakpoint", () => {
  it("treats widths up to and including the maximum as phone, and the next pixel as not", () => {
    assert.equal(isPhoneWidth(PHONE_MAX_WIDTH), true);
    assert.equal(isPhoneWidth(PHONE_MAX_WIDTH + 1), false);
    assert.equal(isPhoneWidth(360), true);
    assert.equal(isPhoneWidth(1280), false);
  });

  it("refuses widths that are not numbers, so an unknown size never folds the page", () => {
    assert.equal(isPhoneWidth(Number.NaN), false);
    assert.equal(isPhoneWidth(undefined), false);
    assert.equal(isPhoneWidth(null), false);
  });

  it("matches the stylesheet: phone rules stop at the constant, wider rules start one pixel above it", () => {
    assert.match(css, new RegExp(`@media \\(max-width: ${PHONE_MAX_WIDTH}px\\)`));
    assert.match(css, new RegExp(`@media \\(min-width: ${PHONE_MAX_WIDTH + 1}px\\)`));
  });

  it("uses the same query text in the hook and in the check", () => {
    assert.equal(PHONE_QUERY, `(max-width: ${PHONE_MAX_WIDTH}px)`);
  });
});

describe("reading the layout from the browser", () => {
  it("reports phone when the browser's media query matches", () => {
    const win = { matchMedia: (query) => ({ matches: query === PHONE_QUERY }) };
    assert.equal(prefersPhoneLayout(win), true);
  });

  it("reports not phone when the media query does not match", () => {
    const win = { matchMedia: () => ({ matches: false }) };
    assert.equal(prefersPhoneLayout(win), false);
  });

  it("falls back to the full layout when matchMedia is unavailable", () => {
    assert.equal(prefersPhoneLayout({}), false);
    assert.equal(prefersPhoneLayout(undefined), false);
  });
});
