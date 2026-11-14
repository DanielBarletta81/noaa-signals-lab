import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchNoaaProduct } from "../src/adapters/noaaClient.js";
import { resolveTimeoutMs } from "../src/adapters/noaaClient.js";
import { UpstreamTimeoutError } from "../src/errors.js";

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const REQUEST = { station: "8454000", product: "water_temperature", range: 24, interval: "h" };

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function htmlResponse(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token '<', \"<html>\" is not valid JSON");
    },
  };
}

// A fetch that never answers on its own. It rejects only when the caller's
// AbortSignal fires, which is how a real fetch behaves.
function hangingFetch() {
  return (url, { signal }) =>
    new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted by caller")));
    });
}

describe("fetchNoaaProduct: happy path against a captured NOAA response", () => {
  it("parses the captured GMT response into 24 ordered points with no exclusions", async () => {
    const payload = fixture("noaa-8454000-water_temperature-gmt-24h.json");
    const result = await fetchNoaaProduct(REQUEST, {
      fetchImpl: async () => jsonResponse(200, payload),
      now: () => new Date("2026-11-13T23:51:00.000Z"),
    });

    assert.equal(result.status, "ok");
    assert.equal(result.stationName, "Providence");
    assert.equal(result.points.length, 24);
    assert.equal(result.quality.receivedRows, 24);
    assert.equal(result.quality.excludedRows, 0);
    assert.equal(result.points[0].timestampUtc, "2026-11-13T01:00:00.000Z");
    assert.equal(result.points.at(-1).timestampUtc, "2026-11-14T00:00:00.000Z");
    assert.equal(result.retrievedAt, "2026-11-13T23:51:00.000Z");
  });
});

describe("fetchNoaaProduct: HTTP and body failures are typed upstream errors", () => {
  it("maps a NOAA HTTP 400 with a JSON error body to a 502 upstream error with sanitized detail", async () => {
    const body = fixture("noaa-error-invalid-station-http400.json");
    await assert.rejects(
      fetchNoaaProduct(REQUEST, { fetchImpl: async () => jsonResponse(400, body) }),
      (error) => {
        assert.equal(error.status, 502);
        assert.equal(error.code, "upstream_error");
        assert.equal(error.publicMessage, "NOAA responded with HTTP 400.");
        assert.equal(error.details.upstreamStatus, 400);
        assert.equal(
          error.details.noaaMessage,
          "The station is not a valid station or there is system error."
        );
        return true;
      }
    );
  });

  it("maps an HTTP 503 with an HTML body to an upstream error without a parse crash", async () => {
    await assert.rejects(
      fetchNoaaProduct(REQUEST, { fetchImpl: async () => htmlResponse(503) }),
      (error) => {
        assert.equal(error.code, "upstream_error");
        assert.equal(error.details.upstreamStatus, 503);
        assert.equal(error.details.noaaMessage, null);
        return true;
      }
    );
  });

  it("maps a 200 response with a non-JSON body to an upstream error", async () => {
    await assert.rejects(
      fetchNoaaProduct(REQUEST, { fetchImpl: async () => htmlResponse(200) }),
      (error) => error.code === "upstream_error" && /not valid JSON/.test(error.publicMessage)
    );
  });

  it("maps a NOAA error object returned with HTTP 200 to an upstream error", async () => {
    await assert.rejects(
      fetchNoaaProduct(REQUEST, {
        fetchImpl: async () =>
          jsonResponse(200, { error: { message: "Wrong Range: The Range is a number" } }),
      }),
      (error) => error.code === "upstream_error" && error.details.noaaMessage.startsWith("Wrong Range")
    );
  });

  it("returns an empty valid dataset (not an error) for NOAA's documented no-data message", async () => {
    const body = fixture("noaa-8454000-water_temperature-nodata-2030.json");
    const result = await fetchNoaaProduct(REQUEST, {
      fetchImpl: async () => jsonResponse(200, body),
    });
    assert.equal(result.status, "empty");
    assert.equal(result.points.length, 0);
    assert.match(result.noaaMessage, /No data was found/);
  });

  it("maps a network failure (fetch rejects before any response) to an unreachable error", async () => {
    await assert.rejects(
      fetchNoaaProduct(REQUEST, {
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
      }),
      (error) => {
        assert.equal(error.status, 502);
        assert.equal(error.code, "upstream_unreachable");
        return true;
      }
    );
  });
});

describe("fetchNoaaProduct: timeouts and abortable requests", () => {
  it("aborts a request that does not answer in time and reports a 504 timeout", async () => {
    let receivedSignal;
    const fetchImpl = (url, options) => {
      receivedSignal = options.signal;
      return hangingFetch()(url, options);
    };

    await assert.rejects(
      fetchNoaaProduct(REQUEST, { fetchImpl, timeoutMs: 20 }),
      (error) => {
        assert.equal(error.status, 504);
        assert.equal(error.code, "upstream_timeout");
        assert.match(error.publicMessage, /did not respond within/);
        return true;
      }
    );
    assert.equal(receivedSignal.aborted, true, "the upstream request was really aborted");
  });

  it("passes an AbortSignal to fetch on every request", async () => {
    let signalSeen = null;
    await fetchNoaaProduct(REQUEST, {
      fetchImpl: async (url, options) => {
        signalSeen = options.signal;
        return jsonResponse(200, { data: [] });
      },
    });
    assert.ok(signalSeen instanceof AbortSignal);
  });

  it("does not report a timeout when the response arrives before the deadline", async () => {
    const result = await fetchNoaaProduct(REQUEST, {
      timeoutMs: 5000,
      fetchImpl: async () => jsonResponse(200, { data: [] }),
    });
    assert.equal(result.status, "empty");
  });
});

describe("UpstreamTimeoutError: the public message states the real limit", () => {
  it("reports sub-second limits in milliseconds, never as zero seconds", () => {
    assert.equal(new UpstreamTimeoutError(400).publicMessage, "NOAA did not respond within 400 ms.");
  });

  it("reports whole-second and fractional-second limits in seconds", () => {
    assert.equal(new UpstreamTimeoutError(8000).publicMessage, "NOAA did not respond within 8 seconds.");
    assert.equal(new UpstreamTimeoutError(1500).publicMessage, "NOAA did not respond within 1.5 seconds.");
  });
});

describe("resolveTimeoutMs: configuration", () => {
  it("uses 8000 ms by default", () => {
    assert.equal(resolveTimeoutMs({}), 8000);
  });

  it("accepts a valid override from the environment", () => {
    assert.equal(resolveTimeoutMs({ NOAA_TIMEOUT_MS: "1500" }), 1500);
  });

  it("falls back to the default for invalid overrides", () => {
    for (const value of ["", "0", "-5", "abc", "1.5", "600000"]) {
      assert.equal(resolveTimeoutMs({ NOAA_TIMEOUT_MS: value }), 8000, `value ${value}`);
    }
  });
});
