// Client-side API layer for saved observation snapshots.
//
// No React and no import.meta here, so the Node test runner can import this module
// directly (see client/test/). Every request goes to a fixed path under the configured
// API base. The values sent are a retrieval ID (save), a numeric snapshot ID (open),
// or paging numbers (list). No filename and no filesystem path is ever sent.

export const SNAPSHOTS_PATH = "/api/snapshots";
export const SNAPSHOT_PAGE_SIZE = 10;
export const SNAPSHOT_MAX_PAGE_SIZE = 50;
export const SNAPSHOT_MAX_OFFSET = 100000;
export const SNAPSHOT_MAX_ID = 9999999999;
export const SNAPSHOT_TIMEOUT_MS = 15000;

// Kinds: client (nothing sent), aborted, timeout, network, http, malformed.
export class SnapshotRequestError extends Error {
  constructor(kind, message, { httpStatus = null, code = null } = {}) {
    super(message);
    this.name = "SnapshotRequestError";
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

function isBoundedInteger(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

export function buildSnapshotListUrl(baseUrl, { limit = SNAPSHOT_PAGE_SIZE, offset = 0 } = {}) {
  if (!isBoundedInteger(limit, 1, SNAPSHOT_MAX_PAGE_SIZE)) {
    throw new RangeError(`Page size must be a whole number from 1 to ${SNAPSHOT_MAX_PAGE_SIZE}.`);
  }
  if (!isBoundedInteger(offset, 0, SNAPSHOT_MAX_OFFSET)) {
    throw new RangeError(`Offset must be a whole number from 0 to ${SNAPSHOT_MAX_OFFSET}.`);
  }
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return `${baseUrl}${SNAPSHOTS_PATH}?${params.toString()}`;
}

export function buildSnapshotUrl(baseUrl, id) {
  if (!isBoundedInteger(id, 1, SNAPSHOT_MAX_ID)) {
    throw new RangeError("A snapshot ID must be a positive whole number.");
  }
  return `${baseUrl}${SNAPSHOTS_PATH}/${id}`;
}

// The shape the list and the detail views rely on. Anything else is malformed.
export function isSnapshotSummary(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Number.isSafeInteger(value.id) &&
    value.id >= 1 &&
    typeof value.retrievedAt === "string" &&
    typeof value.savedAt === "string" &&
    (value.sourceMode === "live" || value.sourceMode === "demonstration")
  );
}

function transportError({ signal, timedOut, timeoutMs }) {
  if (signal?.aborted) return new SnapshotRequestError("aborted", "The request was cancelled.");
  if (timedOut) {
    return new SnapshotRequestError(
      "timeout",
      `The snapshot service did not respond within ${Math.round(timeoutMs / 1000)} seconds.`
    );
  }
  return new SnapshotRequestError(
    "network",
    "Could not reach the snapshot service. Check that the server is running and that the API address is correct."
  );
}

// One JSON request with a timeout and a caller cancellation. Resolves with the parsed
// body when the server answered 2xx with ok: true. Rejects with SnapshotRequestError.
async function requestJson({
  url,
  method = "GET",
  body,
  fetchImpl = globalThis.fetch,
  timeoutMs = SNAPSHOT_TIMEOUT_MS,
  signal,
}) {
  if (signal?.aborted) throw new SnapshotRequestError("aborted", "The request was cancelled.");

  const controller = new AbortController();
  const state = { timedOut: false, signal, timeoutMs };
  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener("abort", onCallerAbort, { once: true });

  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw transportError({ ...state, timedOut: state.timedOut });
    }

    let json;
    try {
      json = await response.json();
    } catch {
      // A non-JSON body (for example an HTML proxy page) is reported by HTTP status below.
      if (state.timedOut || signal?.aborted) throw transportError(state);
      json = undefined;
    }

    if (!response.ok) {
      const message =
        typeof json?.message === "string"
          ? json.message
          : `The snapshot service responded with HTTP ${response.status}.`;
      throw new SnapshotRequestError("http", message, {
        httpStatus: response.status,
        code: typeof json?.code === "string" ? json.code : null,
      });
    }

    if (json?.ok !== true) {
      throw new SnapshotRequestError("malformed", "The snapshot service returned an unexpected response.", {
        httpStatus: response.status,
      });
    }
    return json;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}

function malformed() {
  return new SnapshotRequestError("malformed", "The snapshot service returned an unexpected response.");
}

// Saves the retrieval the server still holds under retrievalId. Resolves with the
// snapshot summary. The client sends only the retrieval ID, never observation data.
export async function saveSnapshot({ baseUrl, retrievalId, ...options }) {
  if (typeof retrievalId !== "string" || retrievalId === "") {
    throw new SnapshotRequestError("client", "There is no loaded observation set to save.");
  }
  const json = await requestJson({
    ...options,
    url: `${baseUrl}${SNAPSHOTS_PATH}`,
    method: "POST",
    body: { retrievalId },
  });
  if (!isSnapshotSummary(json.snapshot)) throw malformed();
  return json.snapshot;
}

// One page of saved snapshots, newest first.
export async function listSnapshots({ baseUrl, limit, offset, ...options }) {
  const json = await requestJson({ ...options, url: buildSnapshotListUrl(baseUrl, { limit, offset }) });
  const valid =
    Array.isArray(json.snapshots) &&
    json.snapshots.every(isSnapshotSummary) &&
    Number.isSafeInteger(json.total) &&
    json.total >= 0;
  if (!valid) throw malformed();
  return { total: json.total, snapshots: json.snapshots };
}

// One saved snapshot with its rebuilt signal body. This is a single request to the
// snapshot store. It never calls the NOAA-backed signal endpoint.
export async function fetchSnapshot({ baseUrl, id, ...options }) {
  const json = await requestJson({ ...options, url: buildSnapshotUrl(baseUrl, id) });
  if (!isSnapshotSummary(json.snapshot) || json.signal?.ok !== true) throw malformed();
  return { snapshot: json.snapshot, signal: json.signal };
}
