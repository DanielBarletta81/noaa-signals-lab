// Parsing for NOAA CO-OPS timestamps returned with time_zone=gmt.
//
// NOAA sends observation times as "YYYY-MM-DD HH:mm" with no offset. Because we
// request GMT, the value is the UTC wall-clock time. We convert it to an explicit
// ISO 8601 UTC string with Date.UTC, never with new Date(string), because the
// string parser's handling of non-ISO input is implementation-dependent.

const NOAA_GMT_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

// Returns { ok: true, iso, epochMs } or { ok: false, reason }.
export function parseNoaaGmtTimestamp(text) {
  if (typeof text !== "string") {
    return { ok: false, reason: "not_a_string" };
  }

  const match = NOAA_GMT_PATTERN.exec(text);
  if (!match) {
    return { ok: false, reason: "unexpected_format" };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) {
    return { ok: false, reason: "out_of_range" };
  }

  // Date.UTC rolls invalid dates forward (2026-02-30 becomes 2026-03-02).
  // Round-tripping the components rejects those rollovers.
  const epochMs = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(epochMs);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, reason: "impossible_date" };
  }

  return { ok: true, iso: date.toISOString(), epochMs };
}
