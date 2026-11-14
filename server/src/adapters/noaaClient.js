// NOAA CO-OPS adapter.
//
// Responsibilities:
//   1. Build the NOAA request (GMT timestamps, metric units, hourly interval).
//   2. Make the HTTP call with an abortable timeout and map every failure mode to
//      a typed error (see ../errors.js).
//   3. Normalize each NOAA row. A row becomes a data point only when its timestamp
//      and its measurement are both valid. Every other row is excluded and
//      recorded with a reason. A missing or malformed value is never converted to
//      0. A real reading of 0 is kept.

import {
  UpstreamError,
  UpstreamTimeoutError,
  UpstreamUnreachableError,
  sanitizeUpstreamMessage,
} from "../errors.js";
import { parseNoaaGmtTimestamp } from "../time/noaaTime.js";

export const NOAA_DATAGETTER_URL =
  "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
export const NOAA_APPLICATION_ID = "noaa_signal_explorer";

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 60000;

// Every reason a row can be excluded. Reported as counts so the UI can explain
// what was left out.
export const EXCLUSION_REASONS = Object.freeze([
  "malformed_row",
  "malformed_timestamp",
  "missing_value",
  "blank_value",
  "malformed_value",
  "non_finite_value",
  "duplicate_timestamp",
]);

// Optional sign, then digits with an optional fraction, or a leading-dot fraction.
// Rejects "", "NaN", "Infinity", "1,2", "1e3", and "12abc".
const NUMERIC_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

// Stated in every response so consumers know flags are carried, not applied.
export const FLAG_POLICY = "preserved_not_interpreted";

// Resolved at call time so tests and deployments can override it.
export function resolveTimeoutMs(env = process.env) {
  const value = Number(env.NOAA_TIMEOUT_MS);
  if (Number.isInteger(value) && value >= 1 && value <= MAX_TIMEOUT_MS) {
    return value;
  }
  return DEFAULT_TIMEOUT_MS;
}

export function buildNoaaUrl({ station, product, range, interval = "h" }) {
  const params = new URLSearchParams({
    product,
    application: NOAA_APPLICATION_ID,
    station,
    range: String(range),
    time_zone: "gmt",
    units: "metric",
    format: "json",
    interval,
  });
  return `${NOAA_DATAGETTER_URL}?${params.toString()}`;
}

/**
 * Fetch and normalize one NOAA product window.
 *
 * Returns:
 *   {
 *     status: "ok" | "empty" | "no_valid_observations",
 *     points: [{ station, product, timestampUtc, observedAtRaw, value, rawValue, flags }],
 *     quality: { receivedRows, acceptedRows, excludedRows, excludedByReason, excluded },
 *     stationName, sourceUrl, retrievedAt
 *   }
 *
 * Throws ApiError subclasses for every failure mode. Never throws a bare
 * TypeError to the route.
 */
export async function fetchNoaaProduct(
  { station, product, range, interval = "h" },
  options = {}
) {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = resolveTimeoutMs(),
    now = () => new Date(),
  } = options;

  const sourceUrl = buildNoaaUrl({ station, product, range, interval });
  const payload = await requestJson(sourceUrl, { fetchImpl, timeoutMs });
  const retrievedAt = now().toISOString();

  return normalizeNoaaResponse(payload, { station, product, sourceUrl, retrievedAt });
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

const PARSE_FAILED = Symbol("parse-failed");

async function requestJson(url, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let response;
    try {
      response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
    } catch {
      if (timedOut) throw new UpstreamTimeoutError(timeoutMs);
      throw new UpstreamUnreachableError();
    }

    // Read the body once. A body that is not JSON (an HTML error page, for
    // example) is recorded as PARSE_FAILED rather than thrown, so the HTTP status
    // still determines the error.
    let payload;
    try {
      payload = await response.json();
    } catch {
      if (timedOut) throw new UpstreamTimeoutError(timeoutMs);
      payload = PARSE_FAILED;
    }

    if (!response.ok) {
      throw new UpstreamError(`NOAA responded with HTTP ${response.status}.`, {
        upstreamStatus: response.status,
        noaaMessage:
          payload !== PARSE_FAILED ? sanitizeUpstreamMessage(payload?.error?.message) : null,
      });
    }

    if (payload === PARSE_FAILED) {
      throw new UpstreamError("NOAA returned a response that was not valid JSON.", {
        upstreamStatus: response.status,
      });
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

// NOAA's message for a valid station and product with no data in the requested
// window. NOAA uses this same text when a product is not offered at a station at
// the requested time, and its response does not let us tell those cases apart.
// We therefore report "empty" with emptyReason "noaa_no_data_message" and keep
// NOAA's text so the UI can state the ambiguity. Any other NOAA error text is an
// upstream error. The match is exact and case-sensitive on purpose: near-miss
// wording must not be silently read as "no data".
export const NO_DATA_EMPTY_REASON = "noaa_no_data_message";

// What the response lets us claim about observations in the window.
//   "not_established": NOAA reported no data. The app does not claim the window
//                      has no observations, because the same text is returned when a
//                      product is not offered at the station.
//   "rows_absent_in_window": NOAA returned a valid response with zero rows.
//   null: the request produced observations (or rows that were all excluded), so
//         no absence claim applies.
export const ABSENCE_NOT_ESTABLISHED = "not_established";
export const ABSENCE_ROWS_ABSENT = "rows_absent_in_window";

const NO_DATA_PATTERN = /^No data was found\b/;

function isNoDataMessage(message) {
  return typeof message === "string" && NO_DATA_PATTERN.test(message);
}

export function normalizeNoaaResponse(payload, meta) {
  if (payload && typeof payload === "object" && payload.error) {
    const noaaMessage = sanitizeUpstreamMessage(payload.error.message);
    if (isNoDataMessage(noaaMessage)) {
      return buildResult({
        meta,
        stationName: null,
        status: "empty",
        emptyReason: NO_DATA_EMPTY_REASON,
        absenceStatus: ABSENCE_NOT_ESTABLISHED,
        points: [],
        received: 0,
        excluded: [],
        noaaMessage,
      });
    }
    throw new UpstreamError("NOAA returned an error for this request.", { noaaMessage });
  }

  if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) {
    throw new UpstreamError("NOAA response did not contain a data array.");
  }

  const stationName =
    typeof payload.metadata?.name === "string" ? payload.metadata.name : null;

  const accepted = [];
  const excluded = [];

  payload.data.forEach((row, index) => {
    const result = normalizeRow(row, index, meta);
    if (result.ok) {
      accepted.push(result.point);
    } else {
      excluded.push(result.exclusion);
    }
  });

  // Order by parsed UTC instant. Array.prototype.sort is stable, so for equal
  // instants the original NOAA order is kept.
  accepted.sort((a, b) => Date.parse(a.timestampUtc) - Date.parse(b.timestampUtc));

  // Keep the first row for each instant and exclude later ones. This is an
  // assumption, not a verified NOAA rule. See the Milestone 3 PR notes.
  const points = [];
  for (const point of accepted) {
    const previous = points.at(-1);
    if (previous && previous.timestampUtc === point.timestampUtc) {
      excluded.push({
        index: null,
        reason: "duplicate_timestamp",
        rawTimestamp: point.observedAtRaw,
        rawValue: point.rawValue,
      });
    } else {
      points.push(point);
    }
  }

  return buildResult({
    meta,
    stationName,
    status: points.length > 0 ? "ok" : payload.data.length === 0 ? "empty" : "no_valid_observations",
    emptyReason: points.length === 0 && payload.data.length === 0 ? "no_rows_returned" : null,
    absenceStatus:
      points.length === 0 && payload.data.length === 0 ? ABSENCE_ROWS_ABSENT : null,
    points,
    received: payload.data.length,
    excluded,
    noaaMessage: null,
  });
}

function normalizeRow(row, index, meta) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return excludeRow(index, "malformed_row", null, null);
  }

  const rawTimestamp = scalarOrNull(row.t);
  const rawValue = scalarOrNull(row.v);

  const timestamp = parseNoaaGmtTimestamp(row.t);
  if (!timestamp.ok) {
    return excludeRow(index, "malformed_timestamp", rawTimestamp, rawValue);
  }

  const measurement = classifyMeasurement(row.v);
  if (!measurement.ok) {
    return excludeRow(index, measurement.reason, rawTimestamp, rawValue);
  }

  return {
    ok: true,
    point: {
      station: meta.station,
      product: meta.product,
      timestampUtc: timestamp.iso,
      observedAtRaw: row.t,
      value: measurement.value,
      rawValue: row.v,
      flags: {
        quality: row.q ?? null,
        flag: row.f ?? null,
      },
    },
  };
}

// Returns { ok: true, value } or { ok: false, reason }. Zero is a valid reading.
// Only blank, null, undefined, non-numeric, and non-finite inputs are rejected.
export function classifyMeasurement(raw) {
  if (raw === undefined || raw === null) {
    return { ok: false, reason: "missing_value" };
  }

  if (typeof raw === "number") {
    return Number.isFinite(raw)
      ? { ok: true, value: normalizeZero(raw) }
      : { ok: false, reason: "non_finite_value" };
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return { ok: false, reason: "blank_value" };
    }
    if (!NUMERIC_PATTERN.test(trimmed)) {
      return { ok: false, reason: "malformed_value" };
    }
    const value = Number(trimmed);
    return Number.isFinite(value)
      ? { ok: true, value: normalizeZero(value) }
      : { ok: false, reason: "non_finite_value" };
  }

  return { ok: false, reason: "malformed_value" };
}

// Converts -0 to 0 so the value displays and serializes consistently.
function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

function excludeRow(index, reason, rawTimestamp, rawValue) {
  return { ok: false, exclusion: { index, reason, rawTimestamp, rawValue } };
}

function scalarOrNull(value) {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function buildResult({
  meta,
  stationName,
  status,
  emptyReason = null,
  absenceStatus = null,
  points,
  received,
  excluded,
  noaaMessage,
}) {
  const excludedByReason = Object.fromEntries(EXCLUSION_REASONS.map((r) => [r, 0]));
  for (const item of excluded) {
    excludedByReason[item.reason] += 1;
  }

  return {
    status,
    emptyReason,
    absenceStatus,
    points,
    stationName,
    sourceUrl: meta.sourceUrl,
    retrievedAt: meta.retrievedAt,
    quality: {
      receivedRows: received,
      acceptedRows: points.length,
      excludedRows: excluded.length,
      excludedByReason,
      excluded,
      // NOAA's f and q values are copied into each point unchanged. Their meanings
      // are not verified in this project, so no row is filtered by them.
      flagPolicy: FLAG_POLICY,
    },
    noaaMessage,
  };
}
