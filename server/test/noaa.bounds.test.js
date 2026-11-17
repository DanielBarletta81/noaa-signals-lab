// Bounds on what NOAA may send. A response over the byte cap is refused while it is read,
// and a response with too many rows is refused before any row is normalized. Both are
// upstream errors (502). Real Response objects are used, so the streaming path is tested.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchNoaaProduct, MAX_NOAA_RESPONSE_BYTES, MAX_NOAA_ROWS } from "../src/adapters/noaaClient.js";

const PARAMS = { station: "8454000", product: "water_temperature", range: 24, interval: "h" };

function rows(count, valueText = "12.1") {
  const start = Date.UTC(2026, 10, 1);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start + i * 3600_000).toISOString().slice(0, 16).replace("T", " ");
    return { t: d, v: valueText, f: "0,0,0" };
  });
}

function fetchReturning(body, headers = {}) {
  return async () => new Response(body, { status: 200, headers: { "Content-Type": "application/json", ...headers } });
}

describe("row bound: NOAA may return at most MAX_NOAA_ROWS rows", () => {
  it("accepts a response at the row limit, so every row NOAA sends can be saved", async () => {
    const payload = { metadata: { name: "Providence" }, data: rows(MAX_NOAA_ROWS) };
    const result = await fetchNoaaProduct(PARAMS, { fetchImpl: fetchReturning(JSON.stringify(payload)) });
    assert.equal(result.quality.receivedRows, MAX_NOAA_ROWS);
  });

  it("refuses one row more, as an upstream error, before normalizing any row", async () => {
    const payload = { metadata: { name: "Providence" }, data: rows(MAX_NOAA_ROWS + 1) };
    await assert.rejects(
      fetchNoaaProduct(PARAMS, { fetchImpl: fetchReturning(JSON.stringify(payload)) }),
      (error) => error.code === "upstream_error" && error.status === 502 && /more rows/.test(error.publicMessage)
    );
  });
});

describe("byte bound: a NOAA response larger than the cap is refused while it is read", () => {
  it("refuses a body that grows past the cap without a Content-Length header", async () => {
    // Build a valid-looking JSON document larger than the cap; no Content-Length is sent.
    const padding = "x".repeat(MAX_NOAA_RESPONSE_BYTES + 1024);
    const body = `{"metadata":{"name":"Providence"},"pad":"${padding}","data":[]}`;
    await assert.rejects(
      fetchNoaaProduct(PARAMS, { fetchImpl: fetchReturning(body) }),
      (error) => error.code === "upstream_error" && /larger than this service accepts/.test(error.publicMessage)
    );
  });

  it("refuses a body whose declared Content-Length is over the cap, without reading it", async () => {
    let read = false;
    const fetchImpl = async () => {
      // highWaterMark 0: nothing is pulled until a reader asks, so `read` is set only when
      // the adapter actually reads the body.
      const stream = new ReadableStream(
        {
          pull(controller) {
            read = true;
            controller.enqueue(new TextEncoder().encode("{}"));
            controller.close();
          },
        },
        { highWaterMark: 0 }
      );
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/json", "Content-Length": String(MAX_NOAA_RESPONSE_BYTES + 1) },
      });
    };
    await assert.rejects(
      fetchNoaaProduct(PARAMS, { fetchImpl }),
      (error) => error.code === "upstream_error" && /larger than this service accepts/.test(error.publicMessage)
    );
    assert.equal(read, false, "the body was not read");
  });

  it("accepts a normal-sized response, so the cap does not affect real data", async () => {
    const payload = { metadata: { name: "Providence" }, data: rows(72) };
    const result = await fetchNoaaProduct(PARAMS, { fetchImpl: fetchReturning(JSON.stringify(payload)) });
    assert.equal(result.quality.acceptedRows, 72);
  });

  it("still reports a body that is not JSON as an upstream error, not as the size error", async () => {
    await assert.rejects(
      fetchNoaaProduct(PARAMS, { fetchImpl: fetchReturning("<html>not json</html>") }),
      (error) => error.code === "upstream_error" && /not valid JSON/.test(error.publicMessage)
    );
  });
});
