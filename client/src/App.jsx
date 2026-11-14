import { useNoaaSignal } from "./hooks/useNoaaSignal";
import { SummaryCards } from "./components/SummaryCards.tsx";
import { SignalChart } from "./components/SignalChart.tsx";
import { InsightPanel } from "./components/InsightPanel.tsx";

const STATUS_LABELS = {
  loading: "Loading",
  ready: "Ready",
  // "empty" means nothing plottable. It does not claim the window had no observations.
  empty: "No plottable data",
  error: "Error",
};

const REASON_LABELS = {
  malformed_row: "row is not a valid record",
  malformed_timestamp: "timestamp could not be read",
  missing_value: "value missing",
  blank_value: "value blank",
  malformed_value: "value not numeric",
  non_finite_value: "value not finite",
  duplicate_timestamp: "repeated timestamp (later copy)",
};

export default function App() {
  const { data, status, error, errorCode } = useNoaaSignal();

  const processed = data?.processed;

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">NOAA Signal Explorer</p>
        <h1>Plain-language view of coastal station measurements</h1>
        <p>
          Real NOAA coastal observations, with their timestamps, quality information, and the
          limits of what they show.
        </p>
        <span className="status-pill">{STATUS_LABELS[status] ?? status}</span>
      </section>

      {status === "error" && (
        <section className="card error" role="alert">
          <p>{error}</p>
          {errorCode && <p className="data-sub">Error code: {errorCode}</p>}
        </section>
      )}

      {status === "empty" && data && (
        <section className="card">
          <p className="eyebrow">No plottable data</p>
          <h2>No usable NOAA observations for this request</h2>
          {data.status === "no_valid_observations" ? (
            <p>
              NOAA returned {data.quality.receivedRows} rows for {data.stationName ?? data.station},
              but none passed validation. Excluded rows are never plotted as zero.
            </p>
          ) : data.absenceStatus === "not_established" ? (
            <p>
              NOAA reported no data for this request. That can mean there were no observations in
              the window, or that this product is not offered at this station at that time. NOAA's
              response does not distinguish these cases, so this page does not claim the window
              was empty.
            </p>
          ) : (
            <p>
              NOAA returned a valid response with no rows for {data.stationName ?? data.station} in
              the requested window.
            </p>
          )}
        </section>
      )}

      {status === "ready" && processed && (
        <>
          <SummaryCards summary={processed.summary} />
          <SignalChart series={processed.series} />
          <InsightPanel insight={processed.insight} limitations={processed.limitations} />
        </>
      )}

      {data && <DataQualityNote data={data} />}
    </main>
  );
}

function DataQualityNote({ data }) {
  const { quality, source, stationName, station } = data;
  const reasons = Object.entries(quality.excludedByReason).filter(([, count]) => count > 0);

  return (
    <section className="card">
      <p className="eyebrow">Data quality</p>
      <h2>How this was measured</h2>
      <p>
        Station {stationName ?? "unknown"} ({station}). NOAA rows received:{" "}
        {quality.receivedRows}; used: {quality.acceptedRows}; excluded:{" "}
        {quality.excludedRows}.
      </p>
      {reasons.length > 0 && (
        <ul>
          {reasons.map(([reason, count]) => (
            <li key={reason}>
              {count} {count === 1 ? "row" : "rows"}: {REASON_LABELS[reason] ?? reason}
            </li>
          ))}
        </ul>
      )}
      <p>
        NOAA quality flags (the f and q fields) are kept with each reading but are not yet
        scientifically interpreted. Flagged readings are included in the summary and chart.
      </p>
      <p className="data-sub">
        Source: {source.name}. Times are GMT (UTC). Retrieved {source.retrievedAt}.
      </p>
    </section>
  );
}
