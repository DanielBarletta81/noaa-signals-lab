import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_TIMEOUT_MS,
  DEFAULT_SIGNAL_QUERY,
  SignalRequestError,
  buildSignalUrl,
  fetchSignal,
  resolveApiBaseUrl,
  stateFromError,
  stateFromResult,
} from "../src/api/signalApi.js";

// SYNTHETIC response shape for tests. Not a NOAA observation.
const OK_BODY = {
  ok: true,
  status: "ok",
  station: "8454000",
  processed: { summary: { count: 2 }, series: [], insight: "x", limitations: [] },
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// A response whose body cannot be parsed, like an HTML proxy error page.
function htmlResponse(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token '<'");
    },
  };
}

// A fetch that only settles when the caller's AbortSignal fires, like a real one.
function hangingFetch() {
  return (url, { signal }) =>
    new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
}

async function expectRequestError(promise, kind) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof SignalRequestError, `expected SignalRequestError, got ${error}`);
    assert.equal(error.kind, kind);
    return error;
  }
  assert.fail(`expected a ${kind} error`);
}

describe("resolveApiBaseUrl: the configured API origin", () => {
  it("returns an empty base (relative, proxied requests) when unset, blank, or null", () => {
    assert.equal(resolveApiBaseUrl(undefined), "");
    assert.equal(resolveApiBaseUrl(null), "");
    assert.equal(resolveApiBaseUrl(""), "");
    assert.equal(resolveApiBaseUrl("   "), "");
  });

  it("accepts an https origin and removes trailing slashes", () => {
    assert.equal(resolveApiBaseUrl("https://noaa-api.example.org/"), "https://noaa-api.example.org");
    assert.equal(resolveApiBaseUrl("https://noaa-api.example.org///"), "https://noaa-api.example.org");
  });

  it("keeps a path prefix for a server mounted under a subpath", () => {
    assert.equal(resolveApiBaseUrl("https://example.org/noaa/"), "https://example.org/noaa");
  });

  it("accepts plain http only for localhost", () => {
    assert.equal(resolveApiBaseUrl("http://localhost:4200"), "http://localhost:4200");
    assert.equal(resolveApiBaseUrl("http://127.0.0.1:4200"), "http://127.0.0.1:4200");
  });

  it("rejects plain http for a remote host, because the data would travel unencrypted", () => {
    const error = captureError(() => resolveApiBaseUrl("http://noaa-api.example.org"));
    assert.equal(error.kind, "config");
    assert.match(error.message, /must use https/);
  });

  it("rejects values that are not absolute URLs", () => {
    for (const value of ["noaa-api.example.org", "/api", "ftp://example.org", "javascript:alert(1)"]) {
      assert.throws(() => resolveApiBaseUrl(value), (error) => error.kind === "config", value);
    }
  });

  it("rejects a query string, a fragment, or embedded credentials", () => {
    for (const value of [
      "https://api.example.org/?key=1",
      "https://api.example.org/#frag",
      "https://user:pass@api.example.org",
    ]) {
      assert.throws(() => resolveApiBaseUrl(value), (error) => error.kind === "config", value);
    }
  });
});

describe("buildSignalUrl: request URL", () => {
  it("builds a same-origin relative URL when the base is empty", () => {
    assert.equal(
      buildSignalUrl("", DEFAULT_SIGNAL_QUERY),
      "/api/signals?station=8454000&product=water_temperature&range=24"
    );
  });

  it("prefixes the configured origin when one is set", () => {
    assert.equal(
      buildSignalUrl("https://noaa-api.example.org", DEFAULT_SIGNAL_QUERY),
      "https://noaa-api.example.org/api/signals?station=8454000&product=water_temperature&range=24"
    );
  });

  it("never contains a hard-coded localhost unless the configured base does", () => {
    assert.equal(buildSignalUrl("", DEFAULT_SIGNAL_QUERY).includes("localhost"), false);
    assert.equal(buildSignalUrl("https://noaa-api.example.org").includes("localhost"), false);
  });

  it("encodes query values so unexpected characters cannot change the parameters", () => {
    const url = new URL(buildSignalUrl("", { station: "8454000", product: "a&b=c", range: 1 }), "http://x");
    assert.equal(url.searchParams.get("product"), "a&b=c");
    assert.equal(url.searchParams.get("range"), "1");
  });
});

describe("fetchSignal: successful responses", () => {
  it("resolves ready for a response with status ok", async () => {
    const result = await fetchSignal({
      url: "/api/signals",
      fetchImpl: async () => jsonResponse(200, OK_BODY),
    });
    assert.equal(result.status, "ready");
    assert.equal(result.data.station, "8454000");
  });

  it("resolves empty for a valid response with no plottable data", async () => {
    for (const status of ["empty", "no_valid_observations"]) {
      const result = await fetchSignal({
        url: "/api/signals",
        fetchImpl: async () => jsonResponse(200, { ok: true, status, processed: {} }),
      });
      assert.equal(result.status, "empty", status);
    }
  });

  it("sends the URL, a JSON Accept header, and an AbortSignal", async () => {
    let seen;
    await fetchSignal({
      url: "/api/signals?range=24",
      fetchImpl: async (url, options) => {
        seen = { url, options };
        return jsonResponse(200, OK_BODY);
      },
    });
    assert.equal(seen.url, "/api/signals?range=24");
    assert.equal(seen.options.headers.Accept, "application/json");
    assert.ok(seen.options.signal instanceof AbortSignal);
  });
});

describe("fetchSignal: failure kinds the UI can distinguish", () => {
  it("reports a server error response as kind http, with the server's code and message", async () => {
    const error = await expectRequestError(
      fetchSignal({
        url: "/api/signals",
        fetchImpl: async () =>
          jsonResponse(502, {
            ok: false,
            code: "upstream_error",
            message: "NOAA responded with HTTP 400.",
          }),
      }),
      "http"
    );
    assert.equal(error.httpStatus, 502);
    assert.equal(error.code, "upstream_error");
    assert.equal(error.message, "NOAA responded with HTTP 400.");
  });

  it("reports an HTTP error with a non-JSON body using a generic message, without a parse crash", async () => {
    const error = await expectRequestError(
      fetchSignal({ url: "/api/signals", fetchImpl: async () => htmlResponse(503) }),
      "http"
    );
    assert.equal(error.httpStatus, 503);
    assert.equal(error.code, null);
    assert.equal(
      error.message,
      "The signal API responded with HTTP 503. The API server may be stopped or unavailable."
    );
  });

  it("reports a 2xx response that is not JSON as malformed", async () => {
    await expectRequestError(
      fetchSignal({ url: "/api/signals", fetchImpl: async () => htmlResponse(200) }),
      "malformed"
    );
  });

  it("reports a 2xx JSON response without ok:true as malformed", async () => {
    await expectRequestError(
      fetchSignal({ url: "/api/signals", fetchImpl: async () => jsonResponse(200, { hello: 1 }) }),
      "malformed"
    );
  });

  it("reports a fetch that rejects before any response as kind network", async () => {
    const error = await expectRequestError(
      fetchSignal({
        url: "/api/signals",
        fetchImpl: async () => {
          throw new TypeError("Failed to fetch");
        },
      }),
      "network"
    );
    assert.match(error.message, /Could not reach the signal API/);
  });
});

describe("fetchSignal: timeouts and cancellation are not the same thing", () => {
  it("reports a response that does not arrive in time as kind timeout, and aborts the request", async () => {
    let requestSignal;
    const fetchImpl = (url, options) => {
      requestSignal = options.signal;
      return hangingFetch()(url, options);
    };
    const error = await expectRequestError(
      fetchSignal({ url: "/api/signals", fetchImpl, timeoutMs: 20 }),
      "timeout"
    );
    assert.equal(requestSignal.aborted, true, "the browser request was really aborted");
    assert.match(error.message, /did not respond within/);
  });

  it("reports a timeout that fires while the body is being read as kind timeout", async () => {
    const fetchImpl = async (url, { signal }) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    });
    await expectRequestError(fetchSignal({ url: "/api/signals", fetchImpl, timeoutMs: 20 }), "timeout");
  });

  it("reports a cancellation by the caller as kind aborted, not as a timeout", async () => {
    const caller = new AbortController();
    const pending = fetchSignal({
      url: "/api/signals",
      fetchImpl: hangingFetch(),
      timeoutMs: 5000,
      signal: caller.signal,
    });
    caller.abort();
    await expectRequestError(pending, "aborted");
  });

  it("does not call fetch at all when the caller has already cancelled", async () => {
    const caller = new AbortController();
    caller.abort();
    let called = false;
    await expectRequestError(
      fetchSignal({
        url: "/api/signals",
        fetchImpl: async () => {
          called = true;
          return jsonResponse(200, OK_BODY);
        },
        signal: caller.signal,
      }),
      "aborted"
    );
    assert.equal(called, false);
  });

  it("uses a client timeout longer than the server's 8 second NOAA timeout", () => {
    assert.ok(CLIENT_TIMEOUT_MS > 8000);
  });
});

describe("stateFromError and stateFromResult: what the UI shows", () => {
  it("maps each failure kind to a specific, non-misleading error code", () => {
    const cases = [
      ["config", "invalid_api_config"],
      ["timeout", "client_timeout"],
      ["network", "network_error"],
      ["malformed", "unexpected_response"],
    ];
    for (const [kind, code] of cases) {
      const state = stateFromError(new SignalRequestError(kind, "message"));
      assert.equal(state.status, "error", kind);
      assert.equal(state.errorCode, code, kind);
      assert.equal(state.error, "message", kind);
    }
  });

  it("uses the server's own code for an HTTP error, and http_error when none is given", () => {
    assert.equal(
      stateFromError(new SignalRequestError("http", "m", { code: "upstream_error" })).errorCode,
      "upstream_error"
    );
    assert.equal(stateFromError(new SignalRequestError("http", "m")).errorCode, "http_error");
  });

  it("returns null for a cancelled request, so a stale cancellation cannot overwrite newer state", () => {
    assert.equal(stateFromError(new SignalRequestError("aborted", "cancelled")), null);
  });

  it("maps an unexpected non-SignalRequestError to a generic client error", () => {
    const state = stateFromError(new TypeError("boom"));
    assert.equal(state.status, "error");
    assert.equal(state.errorCode, "client_error");
    assert.doesNotMatch(state.error, /boom/, "internal error text is not shown");
  });

  it("maps a successful result to ready or empty with no error", () => {
    assert.deepEqual(stateFromResult({ status: "ready", data: OK_BODY }), {
      data: OK_BODY,
      status: "ready",
      error: null,
      errorCode: null,
    });
    assert.equal(stateFromResult({ status: "empty", data: {} }).status, "empty");
  });
});

// Returns the error thrown by fn, or fails the test if fn does not throw.
function captureError(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}
