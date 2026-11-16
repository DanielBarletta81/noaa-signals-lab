import { productLabel, sourceNoteFor, snapshotTimes } from "../view/snapshots.js";

// Shown whenever a saved copy is on screen in place of live observations. It names the
// copy as saved, gives the original retrieval and the save time as separate facts, and
// offers the one way back to the current session. That is the last live response this
// page holds. It is not a new request to NOAA. Focus moves here when a copy opens.
export function SnapshotBanner({ snapshot, headingRef, onReturn }) {
  const times = snapshotTimes(snapshot);
  const source = sourceNoteFor(snapshot);
  const station = snapshot.stationName ? `${snapshot.stationName} (${snapshot.stationId})` : `station ${snapshot.stationId}`;

  return (
    <section
      className={`snapshot-banner${source.demonstration ? " snapshot-banner--demo" : ""}`}
      aria-labelledby="snapshot-banner-title"
    >
      <p className="snapshot-banner-label">Saved snapshot · not live data</p>
      <h2 id="snapshot-banner-title" tabIndex={-1} ref={headingRef}>
        Snapshot {snapshot.id}: {station}, {productLabel(snapshot.product)}
      </h2>
      <p className="snapshot-banner-text">
        These values were saved earlier. They were not requested from NOAA again, and they do not change
        when NOAA&apos;s data changes.
      </p>
      <dl className="snapshot-facts">
        <div>
          <dt>Originally retrieved</dt>
          <dd>
            <time dateTime={snapshot.retrievedAt}>{times.retrieved}</time>
          </dd>
        </div>
        <div>
          <dt>Saved</dt>
          <dd>
            <time dateTime={snapshot.savedAt}>{times.saved}</time>
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{source.text}</dd>
        </div>
      </dl>
      <button type="button" className="link-button" onClick={onReturn}>
        Return to current session
      </button>
    </section>
  );
}
