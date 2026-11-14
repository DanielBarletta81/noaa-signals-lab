import { formatCelsius, formatUtcClock } from "../view/format.js";

// The same hours as the picture, as text. Scientists can copy it, and screen-reader
// users get every value without a chart. Excluded and missing hours have no value.
export function DataTable({ slots, caption }) {
  return (
    <details className="data-table">
      <summary>Table of every hour in the window ({slots.length})</summary>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable hourly table">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Hour (UTC)</th>
              <th scope="col">Status</th>
              <th scope="col">Water temperature</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.iso} data-status={slot.status}>
                <th scope="row">{formatUtcClock(slot.iso)}</th>
                <td>{statusText(slot)}</td>
                <td>{slot.status === "observed" ? formatCelsius(slot.value) : "no value"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function statusText(slot) {
  if (slot.status === "observed") return "observed";
  if (slot.status === "excluded") return `excluded (${String(slot.reason).replace(/_/g, " ")})`;
  return "no row returned";
}
