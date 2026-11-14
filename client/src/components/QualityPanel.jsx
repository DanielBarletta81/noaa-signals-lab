import { formatUtcLong } from "../view/format.js";

const REASON_LABELS = {
  malformed_row: "row is not a valid record",
  malformed_timestamp: "timestamp could not be read",
  missing_value: "value missing",
  blank_value: "value blank",
  malformed_value: "value not numeric",
  non_finite_value: "value not finite",
  duplicate_timestamp: "repeated timestamp (later copy)",
};

// Counts and provenance for the response. Every number here comes from the API.
export function QualityPanel({ data }) {
  const { quality, source, stationName, station, range } = data;
  const reasons = Object.entries(quality.excludedByReason).filter(([, count]) => count > 0);

  return (
    <section className="panel" aria-labelledby="quality-title">
      <p className="panel-kicker">Data quality</p>
      <h2 id="quality-title">How complete is this window?</h2>
      <dl className="quality-counts">
        <div>
          <dt>Rows received</dt>
          <dd>{quality.receivedRows}</dd>
        </div>
        <div>
          <dt>Used</dt>
          <dd>{quality.acceptedRows}</dd>
        </div>
        <div>
          <dt>Excluded</dt>
          <dd>{quality.excludedRows}</dd>
        </div>
        <div>
          <dt>Requested window</dt>
          <dd>{range} h</dd>
        </div>
      </dl>
      {reasons.length > 0 ? (
        <>
          <h3>Why rows were excluded</h3>
          <ul className="plain-list">
            {reasons.map(([reason, count]) => (
              <li key={reason}>
                {count} {count === 1 ? "row" : "rows"}: {REASON_LABELS[reason] ?? reason}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="panel-note">No rows were excluded.</p>
      )}
      <p className="panel-note">
        NOAA quality flags (the f and q fields) are kept with each reading. They are not yet
        scientifically interpreted, so flagged readings are included.
      </p>
      <p className="panel-source">
        {stationName ?? "Station"} ({station}). Source: {source.name}. Times are GMT (UTC). Retrieved{" "}
        {formatUtcLong(source.retrievedAt)}.
      </p>
    </section>
  );
}
