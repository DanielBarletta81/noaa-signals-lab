import { useEffect, useRef } from "react";
import {
  ARCHIVE_NOTE,
  hasMoreSnapshots,
  productLabel,
  saveFailureAction,
  snapshotTimes,
  sourceNoteFor,
} from "../view/snapshots.js";

// Save the live observation set, and list and open saved copies. Buttons use
// aria-disabled instead of disabled while busy, so keyboard focus is never dropped.
export function SnapshotPanel({
  mode,
  canSave,
  savedAsId,
  saveStatus,
  saveError,
  saveErrorCode,
  saveEvent,
  onSave,
  onReloadObservations,
  list,
  more,
  onLoadMore,
  opening,
  activeId,
  onOpen,
}) {
  const noticeRef = useRef(null);

  // After a successful save, move focus to the confirmation. saveEvent starts at 0,
  // so nothing is focused on first render.
  useEffect(() => {
    if (saveEvent > 0) noticeRef.current?.focus();
  }, [saveEvent]);

  const saving = saveStatus === "saving";
  const olderBusy = more.status === "loading";
  // When the retrieval is gone, saving again cannot succeed, so offer a fresh load instead.
  const recovery = saveFailureAction(saveErrorCode);

  return (
    <section className="panel panel--lab snapshot-panel" aria-labelledby="snapshot-title">
      <p className="panel-kicker">Lab bench · saved copies</p>
      <h2 id="snapshot-title">Saved observations</h2>
      <p className="panel-note">
        Saving keeps this NOAA response, with its excluded rows and quality flags, as it was when saved.
        Opening a saved copy does not contact NOAA.
      </p>
      <p className="panel-note snapshot-archive-note">{ARCHIVE_NOTE}</p>

      {mode === "live" ? (
        <div className="snapshot-save">
          {savedAsId !== null ? (
            <p className="snapshot-notice" role="status" tabIndex={-1} ref={noticeRef}>
              Saved as snapshot {savedAsId}. It appears in the list below.
            </p>
          ) : recovery ? (
            <button type="button" className="snapshot-button" onClick={onReloadObservations}>
              {recovery.label}
            </button>
          ) : canSave ? (
            <button
              type="button"
              className="snapshot-button"
              aria-disabled={saving ? "true" : undefined}
              onClick={saving ? undefined : onSave}
            >
              {saving ? "Saving…" : "Save these observations"}
            </button>
          ) : (
            <p className="panel-note">Saving becomes available when observations have loaded.</p>
          )}
          {saveError && (
            <p className="snapshot-error" role="alert">
              {saveError}
            </p>
          )}
        </div>
      ) : (
        <p className="panel-note">
          You are viewing a saved copy, which is read-only here. Return to current session to save a new copy.
        </p>
      )}

      <div className="snapshot-list-block">
        <h3>Saved copies</h3>
        {opening.error && (
          <p className="snapshot-error" role="alert">
            {opening.error}
          </p>
        )}
        {list.status === "loading" && list.items.length === 0 && (
          <p className="panel-note" role="status">
            Loading saved copies…
          </p>
        )}
        {list.status === "error" && (
          <p className="snapshot-error" role="alert">
            Saved copies could not be listed. {list.error}
          </p>
        )}
        {list.status === "ready" && list.items.length === 0 && (
          <p className="panel-note">No observations have been saved yet.</p>
        )}
        {list.items.length > 0 && (
          <ol className="snapshot-list" aria-label="Saved snapshots, newest first">
            {list.items.map((snapshot) => (
              <li key={snapshot.id}>
                <SnapshotItem
                  snapshot={snapshot}
                  active={snapshot.id === activeId}
                  opening={opening.id === snapshot.id}
                  onOpen={onOpen}
                />
              </li>
            ))}
          </ol>
        )}
        {list.status === "ready" && hasMoreSnapshots({ loaded: list.items.length, total: list.total }) && (
          <button
            type="button"
            className="snapshot-button"
            aria-disabled={olderBusy ? "true" : undefined}
            onClick={olderBusy ? undefined : () => onLoadMore(list.items.length)}
          >
            {olderBusy ? "Loading older copies…" : "Load older snapshots"}
          </button>
        )}
        {more.error && (
          <p className="snapshot-error" role="alert">
            {more.error}
          </p>
        )}
      </div>
    </section>
  );
}

// The full text of each entry is its accessible name, so the title, the station, the
// two times, and any demonstration label are all read out together.
function SnapshotItem({ snapshot, active, opening, onOpen }) {
  const times = snapshotTimes(snapshot);
  const source = sourceNoteFor(snapshot);
  return (
    <button
      type="button"
      className="snapshot-item"
      aria-current={active ? "true" : undefined}
      aria-busy={opening ? "true" : undefined}
      onClick={() => onOpen(snapshot.id)}
    >
      <span className="snapshot-item-title">
        Snapshot {snapshot.id}
        {source.demonstration && <span className="snapshot-badge">Demonstration</span>}
        {active && <span className="snapshot-badge snapshot-badge--open">Open now</span>}
      </span>
      <span className="snapshot-item-meta">
        {snapshot.stationName ?? "Station"} ({snapshot.stationId}) · {productLabel(snapshot.product)} ·{" "}
        {snapshot.requestedHours} h window
      </span>
      <span className="snapshot-item-meta">Originally retrieved {times.retrieved}</span>
      <span className="snapshot-item-meta">Saved {times.saved}</span>
      {source.demonstration && <span className="snapshot-item-note">{source.text}</span>}
      {opening && <span className="snapshot-item-meta">Opening…</span>}
    </button>
  );
}
