import { createSignalInsight } from "./insightEngine.js";

export function processSignal(points) {
  if (!points.length) {
    return {
      latest: null,
      series: [],
      summary: null,
      insight: "No valid NOAA data points were returned for this request.",
    };
  }

  const series = points.map((point) => ({
    time: point.timestamp,
    value: point.value,
  }));

  const latest = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : null;

  const change =
    previous && previous.value !== 0
      ? Number((latest.value - previous.value).toFixed(2))
      : 0;

  const trend = change > 0.2 ? "rising" : change < -0.2 ? "falling" : "stable";

  const values = points.map((point) => point.value);

  const summary = {
    product: latest.product,
    station: latest.station,
    latestValue: latest.value,
    min: Math.min(...values),
    max: Math.max(...values),
    average: Number(
      (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)
    ),
    change,
    trend,
    count: values.length,
  };

  return {
    latest,
    series,
    summary,
    insight: createSignalInsight({
      product: latest.product,
      latestValue: latest.value,
      trend,
    }),
  };
}