// Readout: the largest typographic element on the page. It shows one measured value
// (or one explicit "no value" state) with its UTC time. It never shows a value for an
// excluded or missing hour.
export function Readout({ heading, value, unit = "°C", observedAt, note, tone = "observed" }) {
  const hasValue = value !== null && value !== undefined;
  return (
    <div className={`readout readout-${tone}`} aria-live="polite">
      <p className="readout-heading">{heading}</p>
      <p className={hasValue ? "readout-value" : "readout-value readout-empty"}>
        {hasValue ? (
          <>
            <span className="numeral">{value}</span>
            <span className="readout-unit">{unit}</span>
          </>
        ) : (
          <span className="numeral" aria-label="no value">—</span>
        )}
      </p>
      {observedAt && <p className="readout-time">{observedAt}</p>}
      {note && <p className="readout-note">{note}</p>}
    </div>
  );
}
