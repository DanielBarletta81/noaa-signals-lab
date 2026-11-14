// Formatting helpers for the instrument display. All times are shown in UTC with an
// explicit label, because the data is GMT by request (see docs/DATA_DICTIONARY.md).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utcParts(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const date = new Date(ms);
  return {
    day: String(date.getUTCDate()).padStart(2, "0"),
    month: MONTHS[date.getUTCMonth()],
    year: date.getUTCFullYear(),
    hour: String(date.getUTCHours()).padStart(2, "0"),
    minute: String(date.getUTCMinutes()).padStart(2, "0"),
  };
}

// "2026-11-14T00:00:00.000Z" -> "14 Nov 2026, 00:00 UTC"
export function formatUtcLong(iso) {
  const p = utcParts(iso);
  return p ? `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} UTC` : "time not available";
}

// "2026-11-14T00:00:00.000Z" -> "00:00"
export function formatUtcClock(iso) {
  const p = utcParts(iso);
  return p ? `${p.hour}:${p.minute}` : "--:--";
}

// Axis label: clock time, with the date at midnight so day boundaries are visible.
// "2026-11-14T00:00:00.000Z" -> "14 Nov 00:00"; "2026-11-13T15:00:00.000Z" -> "15:00"
export function formatUtcAxis(iso) {
  const p = utcParts(iso);
  if (!p) return "";
  return p.hour === "00" && p.minute === "00" ? `${p.day} ${p.month} ${p.hour}:${p.minute}` : `${p.hour}:${p.minute}`;
}

// Degrees Celsius with the unit. Values are the parsed numbers from the API.
export function formatCelsius(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${value} °C` : "no value";
}

// One accessible name per timeline hour, so a screen reader hears the same facts as
// the picture: the time, what happened to it, and the value only when one exists.
export function describeSlot(slot) {
  const when = formatUtcLong(slot.iso);
  if (slot.status === "observed") return `${when}: observed, ${formatCelsius(slot.value)}`;
  if (slot.status === "excluded") {
    return `${when}: row excluded (${String(slot.reason).replace(/_/g, " ")}), not plotted`;
  }
  return `${when}: no row returned by NOAA`;
}
