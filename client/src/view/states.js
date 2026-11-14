// Turns an error code or an empty response into what the page says and whether a
// retry can help. Each description states what is not known as clearly as what is.
// Nothing here estimates or fills in a missing measurement.

const ERROR_STATES = {
  upstream_timeout: {
    title: "NOAA did not respond in time",
    body: "The server stopped waiting for NOAA. No values are shown, and none have been estimated. NOAA may be slow or temporarily unavailable.",
    retryable: true,
  },
  upstream_error: {
    title: "NOAA returned an error",
    body: "NOAA answered, but not with usable observations, so none are shown. The message below is NOAA's own text, with markup removed.",
    retryable: true,
  },
  upstream_unreachable: {
    title: "NOAA could not be reached",
    body: "The server could not open a connection to NOAA. No values are shown. This is usually temporary.",
    retryable: true,
  },
  network_error: {
    title: "The signal API is not reachable",
    body: "The browser could not reach the signal service. Check that the server is running, then retry.",
    retryable: true,
  },
  client_timeout: {
    title: "The request took too long",
    body: "The browser stopped waiting for the signal service. No values are shown.",
    retryable: true,
  },
  internal_error: {
    title: "The signal service hit an unexpected error",
    body: "The server logged the failure. No values are shown, and none have been estimated.",
    retryable: true,
  },
  http_error: {
    title: "The signal service returned an unexpected status",
    body: "The response was not a usable observation set, so no values are shown.",
    retryable: true,
  },
  unexpected_response: {
    title: "The signal service returned an unexpected response",
    body: "The response did not have the expected structure, so no values are shown.",
    retryable: true,
  },
  invalid_api_config: {
    title: "The API address is misconfigured",
    body: "VITE_API_BASE_URL is set to a value this app will not use (it must be https, or http on localhost). Fix the build configuration; retrying will not help.",
    retryable: false,
  },
  invalid_parameter: {
    title: "The request parameters were rejected",
    body: "The server rejected the station, product, or window. This page only requests the verified station, so this indicates a configuration problem.",
    retryable: false,
  },
};

const FALLBACK_ERROR = {
  title: "The observations could not be loaded",
  body: "An unexpected problem occurred. No values are shown, and none have been estimated.",
  retryable: true,
};

export function describeError(code) {
  return ERROR_STATES[code] ?? FALLBACK_ERROR;
}

// Describes a valid response that has no plottable observations.
// The three cases are kept distinct: they are not the same claim about NOAA.
export function describeEmpty(data) {
  if (data?.status === "no_valid_observations") {
    return {
      title: "Rows came back, but none could be used",
      body: `NOAA returned ${data.quality?.receivedRows ?? "some"} rows. Each was excluded for a stated reason (see Data quality). Excluded rows are never plotted, and never treated as zero.`,
    };
  }
  if (data?.absenceStatus === "not_established") {
    return {
      title: "NOAA reported no data for this request",
      body: "This can mean there were no observations in the window, or that this product is not offered at this station at that time. NOAA's response does not distinguish these cases, so this page does not claim the window was empty.",
    };
  }
  return {
    title: "NOAA returned no rows for this window",
    body: "NOAA returned a valid response with zero rows for the requested window.",
  };
}
