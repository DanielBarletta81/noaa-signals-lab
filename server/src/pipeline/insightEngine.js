// Neutral summary text for the insight panel.
//
// Scope: this text only restates measured values, their UTC time, and the window
// they belong to. It does not classify water temperature as healthy, harmful,
// elevated, low, or unusual, and it does not infer ecological effects.
//
// Why no thresholds: the earlier version used 26 °C ("elevated") and 8 °C ("low")
// with claims about metabolic stress, oxygen, and feeding. None of those were
// linked to a cited source, and they are not valid for every site, season, depth,
// or species. A judgment like that needs a cited, site-specific criterion, which
// this project does not yet have.

export const INSIGHT_LIMITATIONS = Object.freeze([
  "Values are NOAA-reported observations from one station. This panel does not interpret them.",
  "NOAA quality flags (f and q fields) are kept in the data but are not yet scientifically interpreted. Flagged readings are included.",
  "No time-window trend is calculated in this version.",
  "Excluded rows are not plotted and are never treated as zero.",
]);

export function createSignalInsight({ product, station, latest, summary }) {
  if (product !== "water_temperature" || !latest || !summary) {
    return "Measured values for this product are listed without interpretation.";
  }

  const observations = summary.count === 1 ? "observation" : "observations";

  return (
    `Latest accepted observation: ${latest.value} °C at ${formatUtc(latest.timestampUtc)} ` +
    `(NOAA station ${station}). Across the ${summary.count} accepted ${observations} in this window, ` +
    `values ranged from ${summary.min} °C to ${summary.max} °C, with a mean of ${summary.average} °C. ` +
    "These are measured values. This summary does not judge them as healthy, harmful, elevated, " +
    "or unusual, and does not infer ecological effects."
  );
}

// "2026-11-14T00:00:00.000Z" -> "2026-11-14 00:00 UTC"
function formatUtc(iso) {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
