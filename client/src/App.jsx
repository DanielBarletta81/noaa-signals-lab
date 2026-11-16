import { useEffect, useMemo, useRef, useState } from "react";
import { useNoaaSignal } from "./hooks/useNoaaSignal";
import { useSnapshots } from "./hooks/useSnapshots.js";
import { SignalChart } from "./components/SignalChart.tsx";
import { SummaryCards } from "./components/SummaryCards.tsx";
import { InsightPanel } from "./components/InsightPanel.tsx";
import { Readout } from "./components/Readout.jsx";
import { CoverageTimeline } from "./components/CoverageTimeline.jsx";
import { StatePanel } from "./components/StatePanel.jsx";
import { QualityPanel } from "./components/QualityPanel.jsx";
import { MethodPanel } from "./components/MethodPanel.jsx";
import { DataTable } from "./components/DataTable.jsx";
import { SnapshotPanel } from "./components/SnapshotPanel.jsx";
import { CollapsibleSection } from "./components/CollapsibleSection.jsx";
import { usePhoneLayout } from "./hooks/usePhoneLayout.js";
import { SnapshotBanner } from "./components/SnapshotBanner.jsx";
import { usePrefersReducedMotion } from "./view/motion.js";
import { buildCoverage } from "./view/coverage.js";
import { formatUtcLong } from "./view/format.js";
import { describeEmpty, describeError } from "./view/states.js";
import { canSaveLive, snapshotStatusLine, viewFromSnapshot } from "./view/snapshots.js";

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
  const live = useNoaaSignal();
  const snapshots = useSnapshots();
  const reducedMotion = usePrefersReducedMotion();
  const phone = usePhoneLayout();
  // On phones the saved-copies section starts folded. Saving opens it, so the
  // confirmation it focuses is on screen.
  const [savedOpen, setSavedOpen] = useState(false);
  const [selectedIso, setSelectedIso] = useState(null);
  // A saved copy on screen in place of the live response. Null means the live view.
  const [openSnapshot, setOpenSnapshot] = useState(null);
  const bannerHeadingRef = useRef(null);
  const mastheadHeadingRef = useRef(null);
  // Where focus should go after the next view change. Set before the change, read after it.
  const focusRequest = useRef(null);

  useEffect(() => {
    const target = focusRequest.current;
    focusRequest.current = null;
    if (target === "banner") bannerHeadingRef.current?.focus();
    if (target === "masthead") mastheadHeadingRef.current?.focus();
  }, [openSnapshot]);

  // Everything below reads the active view. For a saved copy it is the copy, so the
  // chart, coverage, and quality panels show exactly what was saved.
  const view = openSnapshot ?? {
    data: live.data,
    status: live.status,
    error: live.error,
    errorCode: live.errorCode,
    snapshot: null,
  };
  const { data, status, error, errorCode } = view;
  const snapshotMeta = view.snapshot;

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

  const liveStatusLine = {
    loading: "Loading observations from NOAA through the signal service…",
    ready: `${processed?.summary?.count ?? 0} accepted observations · retrieved ${data ? formatUtcLong(data.source.retrievedAt) : ""}`,
    empty: "No plottable observations for this request",
    error: "Observations are not available",
  }[status];
  const statusLine = snapshotMeta ? snapshotStatusLine(snapshotMeta, data) : liveStatusLine;

  // Save state belongs to the live set. A saved copy has no retrieval ID to save again.
  const liveRetrievalId = typeof live.data?.retrievalId === "string" ? live.data.retrievalId : null;
  const liveCanSave = canSaveLive({ status: live.status, data: live.data, savedAs: snapshots.savedAs });
  const liveSavedAsId =
    liveRetrievalId !== null && Object.hasOwn(snapshots.savedAs, liveRetrievalId)
      ? snapshots.savedAs[liveRetrievalId]
      : null;

  function retry() {
    setSelectedIso(null);
    snapshots.clearSaveError();
    live.reload();
  }

  async function handleOpenSnapshot(id) {
    const opened = await snapshots.openSaved(id);
    if (!opened) return;
    focusRequest.current = "banner";
    setSelectedIso(null);
    setOpenSnapshot(viewFromSnapshot(opened));
  }

  function returnToLive() {
    snapshots.cancelOpen();
    focusRequest.current = "masthead";
    setSelectedIso(null);
    setOpenSnapshot(null);
  }

  async function handleSave() {
    setSavedOpen(true);
    if (liveRetrievalId !== null) await snapshots.saveRetrieval(liveRetrievalId);
  }

  return (
    <div className="page">
      <a className="skip-link" href="#observation">
        Skip to the observation
      </a>

      <header className="masthead">
        <p className="kicker">NOAA CO-OPS observations · measured, not interpreted</p>
        <h1 ref={mastheadHeadingRef} tabIndex={-1}>
          Water temperature at {stationLabel(data)}
        </h1>
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

      {snapshotMeta && (
        <SnapshotBanner snapshot={snapshotMeta} headingRef={bannerHeadingRef} onReturn={returnToLive} />
      )}

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

        <aside className="secondary" aria-label="Saved copies, context, data quality, and methodology">
          <CollapsibleSection
            phone={phone}
            id="saved-copies-section"
            label={`Saved copies (${snapshots.list.total})`}
            open={savedOpen}
            onToggle={setSavedOpen}
          >
            <SnapshotPanel
              mode={snapshotMeta ? "snapshot" : "live"}
              canSave={liveCanSave}
              savedAsId={liveSavedAsId}
              saveStatus={snapshots.saveStatus}
              saveError={snapshots.saveError}
              saveErrorCode={snapshots.saveErrorCode}
              saveEvent={snapshots.saveEvent}
              onSave={handleSave}
              onReloadObservations={retry}
              list={snapshots.list}
              more={snapshots.more}
              onLoadMore={() => snapshots.loadOlder(snapshots.list.items.length)}
              opening={snapshots.opening}
              activeId={snapshotMeta?.id ?? null}
              onOpen={handleOpenSnapshot}
            />
          </CollapsibleSection>
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
