import { useMemo, useState } from "react";
import { useNoaaSignal } from "./hooks/useNoaaSignal";
import { SignalChart } from "./components/SignalChart.tsx";
import { SummaryCards } from "./components/SummaryCards.tsx";
import { InsightPanel } from "./components/InsightPanel.tsx";
import { Readout } from "./components/Readout.jsx";
import { CoverageTimeline } from "./components/CoverageTimeline.jsx";
import { StatePanel } from "./components/StatePanel.jsx";
import { QualityPanel } from "./components/QualityPanel.jsx";
import { MethodPanel } from "./components/MethodPanel.jsx";
import { DataTable } from "./components/DataTable.jsx";
import { usePrefersReducedMotion } from "./view/motion.js";
import { buildCoverage } from "./view/coverage.js";
import { formatUtcLong } from "./view/format.js";
import { describeEmpty, describeError } from "./view/states.js";

const REASON_WORDS = {
  malformed_row: "the row was not a valid record",
  malformed_timestamp: "its timestamp could not be read",
  missing_value: "its value was missing",
  blank_value: "its value was blank",
  malformed_value: "its value was not numeric",
  non_finite_value: "its value was not finite",
  duplicate_timestamp: "it repeated an hour already present",
};

// The readout for a selected hour. Excluded and missing hours never receive a value.
function readoutForSlot(slot) {
  if (slot.status === "observed") {
    return {
      heading: "Selected hour · observed",
      value: slot.value,
      observedAt: formatUtcLong(slot.iso),
      note: "A measured value for this hour.",
      tone: "observed",
    };
  }
  if (slot.status === "excluded") {
    return {
      heading: "Selected hour · excluded",
      value: null,
      observedAt: formatUtcLong(slot.iso),
      note: `NOAA returned a row for this hour, but ${REASON_WORDS[slot.reason] ?? "it failed validation"}. It is not plotted, and no value is shown.`,
      tone: "excluded",
    };
  }
  return {
    heading: "Selected hour · no row",
    value: null,
    observedAt: formatUtcLong(slot.iso),
    note: "NOAA returned no row for this hour. No value is shown, and none is estimated.",
    tone: "missing",
  };
}

function stationLabel(data) {
  if (data?.stationName) return `${data.stationName} (${data.station})`;
  if (data?.station) return `station ${data.station}`;
  return "a NOAA coastal station";
}

export default function App() {
  const { data, status, error, errorCode, reload } = useNoaaSignal();
  const reducedMotion = usePrefersReducedMotion();
  const [selectedIso, setSelectedIso] = useState(null);

  const processed = data?.processed;

  const coverage = useMemo(
    () =>
      data
        ? buildCoverage({
            series: processed?.series ?? [],
            excluded: data.quality?.excluded ?? [],
            requestedHours: data.range,
          })
        : null,
    [data, processed]
  );

  const selectedSlot = coverage?.slots.find((slot) => slot.iso === selectedIso) ?? null;
  const latest = processed?.summary
    ? { value: processed.summary.latestValue, iso: processed.summary.latestTimestampUtc }
    : null;

  let readout = null;
  if (status === "ready" && latest) {
    readout = selectedSlot
      ? readoutForSlot(selectedSlot)
      : {
          heading: "Latest accepted observation",
          value: latest.value,
          observedAt: formatUtcLong(latest.iso),
          note: "The most recent value that passed validation. It is a measurement, not a forecast or a trend.",
          tone: "observed",
        };
  } else if (selectedSlot) {
    readout = readoutForSlot(selectedSlot);
  }

  const errorState = status === "error" ? describeError(errorCode) : null;
  const emptyState = status === "empty" && data ? describeEmpty(data) : null;

  const statusLine = {
    loading: "Loading observations from NOAA through the signal service…",
    ready: `${processed?.summary?.count ?? 0} accepted observations · retrieved ${data ? formatUtcLong(data.source.retrievedAt) : ""}`,
    empty: "No plottable observations for this request",
    error: "Observations are not available",
  }[status];

  function retry() {
    setSelectedIso(null);
    reload();
  }

  return (
    <div className="page">
      <a className="skip-link" href="#observation">
        Skip to the observation
      </a>

      <header className="masthead">
        <p className="kicker">NOAA CO-OPS observations · measured, not interpreted</p>
        <h1>Water temperature at {stationLabel(data)}</h1>
        <p className="deck">
          The measured values, their UTC times, and the coverage of every hour in the window.
          Nothing is interpreted here beyond what the Methodology states.
        </p>
        <p className="journey">
          <span>Instrument: measurement</span>
          <span aria-hidden="true">→</span>
          <span>Field note: observation</span>
          <span aria-hidden="true">→</span>
          <span>Lab bench: interpretation</span>
        </p>
        <p className="status-line" role="status" aria-live="polite">
          {statusLine}
        </p>
      </header>

      <main id="main" className="layout">
        <div className="primary" id="observation" tabIndex={-1}>
          {status === "loading" && (
            <StatePanel
              tone="loading"
              label="Loading"
              title="Requesting observations"
              body="Asking the signal service for the latest NOAA window."
            />
          )}

          {errorState && (
            <StatePanel
              tone="error"
              label="Could not load observations"
              title={errorState.title}
              body={errorState.body}
              code={errorCode}
              onRetry={errorState.retryable ? retry : undefined}
            >
              {error && error !== errorState.body && (
                <p className="state-message">Detail from the service: {error}</p>
              )}
            </StatePanel>
          )}

          {emptyState && (
            <StatePanel tone="empty" label="No plottable observations" title={emptyState.title} body={emptyState.body} />
          )}

          {readout && (
            <div className="readout-block">
              <Readout key={`${readout.heading}|${readout.observedAt}`} variant={selectedSlot ? "field" : "instrument"} {...readout} />
              {selectedIso && (
                <button type="button" className="link-button" onClick={() => setSelectedIso(null)}>
                  Return to the latest observation
                </button>
              )}
            </div>
          )}

          {status === "ready" && processed?.series?.length > 0 && (
            <SignalChart series={processed.series} selectedIso={selectedIso} reducedMotion={reducedMotion} />
          )}

          {coverage && coverage.slots.length > 0 && (
            <>
              <CoverageTimeline
                slots={coverage.slots}
                selectedIso={selectedIso}
                onSelect={(slot) => setSelectedIso(slot.iso)}
              />
              <DataTable
                slots={coverage.slots}
                caption={`Hourly observations in UTC. Window start ${formatUtcLong(coverage.start)}, end ${formatUtcLong(coverage.end)}. The window is inferred from the requested range, not confirmed by NOAA.`}
              />
            </>
          )}
        </div>

        <aside className="secondary" aria-label="Context, data quality, and methodology">
          {status === "ready" && <SummaryCards summary={processed?.summary} />}
          {status === "ready" && (
            <InsightPanel insight={processed?.insight} limitations={processed?.limitations} />
          )}
          {data && <QualityPanel data={data} />}
          <MethodPanel />
        </aside>
      </main>

      <footer className="colophon">
        <p>
          Source: NOAA CO-OPS Data Retrieval API. Measured values only. This page is not a forecast,
          a health assessment, or a safety notice.
        </p>
      </footer>
    </div>
  );
}
