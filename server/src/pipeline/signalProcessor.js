import { createSignalInsight, INSIGHT_LIMITATIONS } from "./insightEngine.js";

// The previous "trend" compared only the last two samples and labeled the result
// as a trend. That is not a time-window trend. It is suppressed until a window
// method (delta plus regression slope in °C per hour, with coverage rules) is
// implemented and tested.
export const TREND_SUPPRESSED = Object.freeze({
  status: "suppressed",
  reason:
    "A time-window trend has not been calculated yet. The former last-step comparison was removed because it could misrepresent a multi-hour change.",
});

// Input: normalized points from the adapter, already sorted by UTC instant with
// duplicates removed. Each point has { timestampUtc, value, ... }.
export function processSignal(points) {
  if (!points.length) {
    return {
      latest: null,
      series: [],
      summary: null,
      trend: TREND_SUPPRESSED,
      insight: "No valid NOAA observations were returned for this request.",
      limitations: INSIGHT_LIMITATIONS,
    };
  }

  const values = points.map((point) => point.value);
  const latest = points[points.length - 1];

  const sum = values.reduce((total, value) => total + value, 0);

  const summary = {
    product: latest.product,
    station: latest.station,
    latestValue: latest.value,
    latestTimestampUtc: latest.timestampUtc,
    min: values.reduce((low, value) => Math.min(low, value)),
    max: values.reduce((high, value) => Math.max(high, value)),
    average: Number((sum / values.length).toFixed(2)),
    count: values.length,
  };

  return {
    latest,
    series: points.map((point) => ({
      time: point.timestampUtc,
      value: point.value,
    })),
    summary,
    trend: TREND_SUPPRESSED,
    insight: createSignalInsight({
      product: latest.product,
      station: latest.station,
      latest,
      summary,
    }),
    limitations: INSIGHT_LIMITATIONS,
  };
}
