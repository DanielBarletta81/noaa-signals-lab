// Client-side API layer for the signal endpoint.
//
// This module has no React and no import.meta, so the Node test runner can import
// it directly (see client/test/). The hook in hooks/useNoaaSignal.js is a thin
// wrapper around these functions.

export const SIGNAL_PATH = "/api/signals";

// The default request. The server's allowlist is the source of truth for valid values.
export const DEFAULT_SIGNAL_QUERY = Object.freeze({
  station: "8454000",
  product: "water_temperature",
  range: 24,
});

// The browser gives up after this long. It must be longer than the server's own
// NOAA timeout (8 s by default), so a slow NOAA answer arrives as a server 504
// rather than a browser timeout.
export const CLIENT_TIMEOUT_MS = 15000;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// A failure with a kind the UI can map to a message.
//   config     the configured API base URL is not usable
//   aborted    the caller cancelled (for example, the component unmounted)
//   timeout    the browser's timer fired before a response finished
//   network    fetch rejected before any HTTP response (server down, DNS, CORS)
//   http       the server answered with a non-2xx status
//   malformed  the server answered 2xx but not with the expected JSON shape
export class SignalRequestError extends Error {
  constructor(kind, message, { httpStatus = null, code = null } = {}) {
    super(message);
    this.name = "SignalRequestError";
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

// Turns VITE_API_BASE_URL into a base URL. Returns "" for relative same-origin
// requests (the default in development, where the Vite proxy forwards /api).
// Throws a "config" error for anything that could send data somewhere unintended.
export function resolveApiBaseUrl(rawValue) {
  if (rawValue === undefined || rawValue === null) return "";

  const value = String(rawValue).trim();
  if (value === "") return "";

  let url;
  try {
    url = new URL(value);
  } catch {
    throw configError(`VITE_API_BASE_URL is not a valid URL: "${value}".`);
  }

  const isLocalHttp = url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname);
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw configError("VITE_API_BASE_URL must use https. Plain http is accepted only for localhost.");
  }
  if (url.search || url.hash) {
    throw configError("VITE_API_BASE_URL must not include a query string or fragment.");
  }
  if (url.username || url.password) {
    throw configError("VITE_API_BASE_URL must not include credentials.");
  }

  return value.replace(/\/+$/, "");
}

export function buildSignalUrl(baseUrl, query = DEFAULT_SIGNAL_QUERY) {
  const params = new URLSearchParams({
    station: String(query.station),
    product: String(query.product),
    range: String(query.range),
  });
  return `${baseUrl}${SIGNAL_PATH}?${params.toString()}`;
}

// Resolves with { status: "ready" | "empty", data } for a successful API response.
// Rejects with SignalRequestError for every failure.
export async function fetchSignal({
  url,
  fetchImpl = globalThis.fetch,
  timeoutMs = CLIENT_TIMEOUT_MS,
  signal,
}) {
  if (signal?.aborted) {
    throw new SignalRequestError("aborted", "The request was cancelled.");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener("abort", onCallerAbort, { once: true });

  const transportFailure = () => {
    if (signal?.aborted) {
      return new SignalRequestError("aborted", "The request was cancelled.");
    }
    if (timedOut) {
      return new SignalRequestError(
        "timeout",
        `The signal API did not respond within ${Math.round(timeoutMs / 1000)} seconds.`
      );
    }
    return new SignalRequestError(
      "network",
      "Could not reach the signal API. Check that the server is running and that the API address is correct."
    );
  };

  try {
    let response;
    try {
      response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
    } catch {
      throw transportFailure();
    }

    let body;
    try {
      body = await response.json();
    } catch {
      // A body that is not JSON (for example an HTML proxy error page) is handled
      // below by HTTP status. If the read itself was cut short, report that instead.
      if (timedOut || signal?.aborted) throw transportFailure();
      body = undefined;
    }

    if (!response.ok) {
      const message =
        typeof body?.message === "string"
          ? body.message
          : `The signal API responded with HTTP ${response.status}. The API server may be stopped or unavailable.`;
      throw new SignalRequestError("http", message, {
        httpStatus: response.status,
        code: typeof body?.code === "string" ? body.code : null,
      });
    }

    if (!body || body.ok !== true) {
      throw new SignalRequestError(
        "malformed",
        "The signal API returned an unexpected response.",
        { httpStatus: response.status }
      );
    }

    return { status: body.status === "ok" ? "ready" : "empty", data: body };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}

// Maps a thrown error to the hook's state. Returns null when the request was
// cancelled on purpose, because a cancelled request must not overwrite newer state.
export function stateFromError(error) {
  if (!(error instanceof SignalRequestError)) {
    return {
      data: null,
      status: "error",
      error: "An unexpected error occurred in the browser.",
      errorCode: "client_error",
    };
  }
  if (error.kind === "aborted") return null;

  const codeByKind = {
    config: "invalid_api_config",
    timeout: "client_timeout",
    network: "network_error",
    malformed: "unexpected_response",
  };

  return {
    data: null,
    status: "error",
    error: error.message,
    errorCode: error.kind === "http" ? error.code ?? "http_error" : codeByKind[error.kind],
  };
}

export function stateFromResult(result) {
  return { data: result.data, status: result.status, error: null, errorCode: null };
}

function configError(message) {
  return new SignalRequestError("config", message);
}
