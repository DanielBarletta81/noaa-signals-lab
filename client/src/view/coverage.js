// Presentation model for the hourly coverage timeline.
//
// Derived only from the API response: accepted points (series), excluded rows
// (quality.excluded, with NOAA's raw timestamp text), and the requested window
// length (range). It never changes a scientific value. It answers one question for
// each hour: was a value observed, was a row returned but excluded, or was no row
// returned at all?
//
// The window alignment is an inference. NOAA returns the requested number of hourly
// rows ending at the newest row. The UI states this inference; it is not verified
// against a NOAA specification.

const RAW_NOAA_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
const HOUR_MS = 60 * 60 * 1000;

// NOAA's raw "YYYY-MM-DD HH:mm" (GMT) to an ISO instant, or null if it is not a real time.
export function parseRawNoaaTime(text) {
  if (typeof text !== "string") return null;
  const match = RAW_NOAA_TIME.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const epochMs = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(epochMs);
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString();
}

/**
 * @param {{ series?: {time: string, value: number}[],
 *           excluded?: {rawTimestamp: string|null, reason: string, rawValue: string|null}[],
 *           requestedHours: number }} input
 * @returns {{ slots: Slot[], start: string|null, end: string|null, outsideWindow: number }}
 *   Slot = { iso, status: "observed"|"excluded"|"missing", value?, reason?, rawValue? }
 */
export function buildCoverage({ series = [], excluded = [], requestedHours }) {
  const hours = Number.isInteger(requestedHours) && requestedHours >= 1 ? requestedHours : 0;

  const accepted = new Map(series.map((point) => [point.time, point.value]));

  // Keep the first exclusion per hour. An accepted point for the same hour always wins.
  const excludedAt = new Map();
  for (const row of excluded) {
    const iso = parseRawNoaaTime(row.rawTimestamp);
    if (iso && !excludedAt.has(iso)) excludedAt.set(iso, row);
  }

  const knownTimes = [...accepted.keys(), ...excludedAt.keys()].map((iso) => Date.parse(iso));
  if (hours === 0 || knownTimes.length === 0) {
    return { slots: [], start: null, end: null, outsideWindow: 0 };
  }

  const endMs = Math.max(...knownTimes);
  const startMs = endMs - (hours - 1) * HOUR_MS;

  const slots = [];
  for (let index = 0; index < hours; index += 1) {
    const iso = new Date(startMs + index * HOUR_MS).toISOString();
    if (accepted.has(iso)) {
      slots.push({ iso, status: "observed", value: accepted.get(iso) });
    } else if (excludedAt.has(iso)) {
      const row = excludedAt.get(iso);
      slots.push({ iso, status: "excluded", reason: row.reason, rawValue: row.rawValue ?? null });
    } else {
      slots.push({ iso, status: "missing" });
    }
  }

  const outsideWindow = [...accepted.keys(), ...excludedAt.keys()].filter((iso) => {
    const ms = Date.parse(iso);
    return ms < startMs || ms > endMs;
  }).length;

  return {
    slots,
    start: slots[0].iso,
    end: slots[slots.length - 1].iso,
    outsideWindow,
  };
}
