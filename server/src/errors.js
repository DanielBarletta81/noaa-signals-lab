// Error types that map to HTTP responses. Each carries a stable machine-readable
// `code` and a sanitized, public `publicMessage`. Raw upstream bodies, stack
// traces, and internal details are never placed in publicMessage.

export class ApiError extends Error {
  constructor(status, code, publicMessage, details = {}) {
    super(publicMessage);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    this.details = details;
  }
}

// 400: the caller sent a parameter we do not accept.
export class ValidationError extends ApiError {
  constructor(errors) {
    super(400, "invalid_parameter", "One or more query parameters are invalid.", {
      errors,
    });
    this.name = "ValidationError";
  }
}

// 502: NOAA answered, but not with usable data (HTTP error, NOAA error object,
// malformed JSON, or missing data array). We do not forward NOAA's raw body.
export class UpstreamError extends ApiError {
  constructor(publicMessage, details = {}) {
    super(502, "upstream_error", publicMessage, details);
    this.name = "UpstreamError";
  }
}

// 504: NOAA did not answer within our timeout. The request was aborted.
export class UpstreamTimeoutError extends ApiError {
  constructor(timeoutMs) {
    super(
      504,
      "upstream_timeout",
      `NOAA did not respond within ${Math.round(timeoutMs / 1000)} seconds.`,
      { timeoutMs }
    );
    this.name = "UpstreamTimeoutError";
  }
}

// 502: the network call failed before NOAA produced a response (DNS, connection
// refused, TLS, etc.).
export class UpstreamUnreachableError extends ApiError {
  constructor() {
    super(502, "upstream_unreachable", "Could not reach the NOAA data service.");
    this.name = "UpstreamUnreachableError";
  }
}

// Keep only short, printable text from an upstream message. Used before any
// NOAA-provided string is returned to a browser.
export function sanitizeUpstreamMessage(value) {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > 200 ? `${cleaned.slice(0, 197)}...` : cleaned;
}
