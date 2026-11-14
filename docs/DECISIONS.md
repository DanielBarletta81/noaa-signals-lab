# Decisions

Short, dated records of decisions that shape what the interface shows and how it can be verified. Newest first.

## 2026-11-14: "Observatory Ledger" visual direction

**Status:** implemented on `feature/noaa-instrument-design`. Not yet merged.

**Problem.** The earlier interface gave every number equal weight, let labels collide with values, drew the chart from zero so the variation disappeared, and displayed the same caveat twice. It did not separate what was measured from what was derived, or what was excluded from what was missing.

**Chosen direction.** A deep ocean-ink background with warm off-white numerals for measured values, a serif display face for headings and numerals, a monospace face for timestamps and evidence, and one sea-glass accent for accepted observations. Each section works like a museum label, and the page reveals detail in a fixed order: observation, context, data quality, methodology.

**Why it serves interpretation.** The temperature series and its latest value are the largest elements, so the measurement leads. Every visual state has a second cue (a shape or a text label), so colour is not the only carrier of meaning. There are no gradients or blur, so nothing decorative competes with the data.

**Alternatives considered and rejected.**
- *Field Chart* (light paper, cartographic grid). Good for print, but fine grid lines compete with the series, and gaps would read as background texture rather than as missing data.
- *Instrument Gauges* (dials with coloured zones). Rejected because zones imply thresholds and health judgments. The project does not have a cited threshold, and inventing one would break the rule against unsourced interpretation.

### Visual vocabulary (one meaning per signal)

| Signal | Meaning | Non-colour cue |
|---|---|---|
| Sea-glass line and solid block | An accepted, measured observation | Solid fill |
| Off-white numerals | A measured value shown as the readout | Largest type on the page |
| Clay hatching | A row NOAA returned that was excluded; no value shown | Diagonal hatch and "row excluded" text |
| Dashed outline | No row returned for that hour; nothing estimated | Dashed outline and "no row returned" text |
| Clay left rule and label | A failed request | "Could not load observations" label |
| Dashed panel border | A valid response with no plottable data | Dashed border and explicit "does not claim" wording |
| Off-white focus ring | Keyboard focus | 3 px outline |

Clay is never an alarm colour. It marks rows that were excluded and failures that need attention, and every use is labelled in text.

### Scientific choices that the design makes visible

- **Straight segments, not a smooth curve.** A monotone spline draws shapes between measured hours. Those shapes suggest values that were never observed, so the chart joins only the measured points.
- **Y axis fitted to the data, labelled in °C.** A zero baseline hid the variation. The axis is fitted to the observed range and labelled, so it is not misleading.
- **Window alignment is inferred.** The coverage strip assumes NOAA returns the requested number of hours ending at the newest row. The page states this assumption in the caption, the method, and the table caption. It is not verified against a NOAA specification.
- **Derived numbers are labelled as derived.** Mean, minimum, and maximum come from accepted observations only, and the panel says so.
- **No trend, threshold, or health statement.** The method panel lists what is not calculated.

## 2026-11-14: Verification scope for this redesign

**Status:** accepted. Reported as part of the pull-request description.

- Automated: 137 server tests, 71 client tests, lint, and production build.
- Browser, scripted in Chrome 157 with Playwright: keyboard path, roving focus, focus visibility, reduced-motion emulation, and phone-width hour targets (20 checks). axe-core (WCAG 2.x A and AA) on 21 captures, with zero violations.
- **Not done:** screen-reader testing (VoiceOver, NVDA), a full WCAG conformance audit, and a continuous screen recording. The interface makes no compliance claim.
- Browser scripts and demonstration harness are kept outside the repository. Adding Playwright as a repository dependency needs approval, so these checks are not yet part of CI.

## 2026-11-14: Small API changes made for presentation

- `stationName` now falls back to the verified allowlist name (`Providence` for 8454000) when NOAA's response has no name, so no-data states still name the station. This does not change any processing.
- The timeout message reports sub-second limits in milliseconds. Whole-second rounding had shown "0 seconds" for a 400 ms limit.

No scientific processing logic changed. The accepted, excluded, and missing counts are unchanged.

## 2026-11-13: Earlier decisions

See `docs/DATA_DICTIONARY.md` for the data policies (timestamps, exclusions, no-data classification, quality flags, and interpretation policy) that this interface follows.
