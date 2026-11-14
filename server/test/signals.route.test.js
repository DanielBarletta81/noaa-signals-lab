import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import { signalsRouter } from "../src/routes/signals.js";
import { NOAA_DATAGETTER_URL } from "../src/adapters/noaaClient.js";

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const GMT_24 = fixture("noaa-8454000-water_temperature-gmt-24h.json");
const NODATA = fixture("noaa-8454000-water_temperature-nodata-2030.json");
const INVALID_STATION = fixture("noaa-error-invalid-station-http400.json");

const realFetch = globalThis.fetch;
let server;
let baseUrl;
let noaaCalls;

// Routes NOAA-bound calls to the supplied responder and lets local test requests
// through to the real fetch.
function mockNoaa(responder) {
  noaaCalls = [];
  mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith(NOAA_DATAGETTER_URL)) {
      noaaCalls.push(String(url));
      return responder(String(url), options);
    }
    return realFetch(url, options);
  });
}

before(async () => {
  const app = express();
  app.use("/api", signalsRouter);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function get(path) {
  const res = await realFetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
}

describe("GET /api/signals: successful responses", () => {
  it("returns 200, observed points in UTC, source metadata, and quality counts", async (t) => {
    mockNoaa(() => jsonResponse(200, GMT_24));
    t.after(() => mock.restoreAll());

    const { status, body } = await get("/api/signals?station=8454000&product=water_temperature&range=24");

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, "ok");
    assert.equal(body.stationName, "Providence");
    assert.equal(body.processed.summary.count, 24);
    assert.equal(body.processed.series[0].time, "2026-11-13T01:00:00.000Z");
    assert.equal(body.processed.summary.latestTimestampUtc, "2026-11-14T00:00:00.000Z");
    assert.equal(body.source.timeZone, "GMT");
    assert.equal(body.quality.receivedRows, 24);
    assert.equal(body.quality.excludedRows, 0);
    assert.equal(body.processed.trend.status, "suppressed");
    assert.equal(Object.hasOwn(body.processed.summary, "trend"), false);
  });

  it("requests time_zone=gmt from NOAA", async (t) => {
    mockNoaa(() => jsonResponse(200, GMT_24));
    t.after(() => mock.restoreAll());

    await get("/api/signals");

    assert.equal(noaaCalls.length, 1);
    assert.equal(new URL(noaaCalls[0]).searchParams.get("time_zone"), "gmt");
  });

  it("surfaces excluded rows in the response without dropping the good ones", async (t) => {
    const payload = {
      metadata: GMT_24.metadata,
      data: [
        { t: "2026-11-13 10:00", v: "12.0", f: "0,0,0" },
        { t: "2026-11-13 11:00", v: "" },
        { t: "2026-11-13 12:00", v: "0.0", f: "0,0,0" },
      ],
    };
    mockNoaa(() => jsonResponse(200, payload));
    t.after(() => mock.restoreAll());

    const { status, body } = await get("/api/signals");

    assert.equal(status, 200);
    assert.equal(body.quality.acceptedRows, 2);
    assert.equal(body.quality.excludedRows, 1);
    assert.equal(body.quality.excludedByReason.blank_value, 1);
    assert.equal(body.processed.summary.min, 0, "genuine zero kept");
    assert.equal(body.processed.summary.count, 2);
  });
});

describe("GET /api/signals: empty valid datasets", () => {
  it("returns 200 with status empty and no summary when NOAA reports no data", async (t) => {
    mockNoaa(() => jsonResponse(200, NODATA));
    t.after(() => mock.restoreAll());

    const { status, body } = await get("/api/signals");

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, "empty");
    assert.equal(body.processed.summary, null);
    assert.deepEqual(body.processed.series, []);
    assert.match(body.source.noaaMessage, /No data was found/);
  });

  it("reports emptyReason and the limitations so the UI can state the ambiguity", async (t) => {
    mockNoaa(() => jsonResponse(200, NODATA));
    t.after(() => mock.restoreAll());

    const { body } = await get("/api/signals");

    assert.equal(body.emptyReason, "noaa_no_data_message");
    assert.equal(body.absenceStatus, "not_established");
    assert.equal(body.quality.flagPolicy, "preserved_not_interpreted");
    assert.ok(body.processed.limitations.length >= 3);
  });

  it("returns status no_valid_observations when every returned row is excluded", async (t) => {
    mockNoaa(() =>
      jsonResponse(200, { data: [{ t: "2026-11-13 10:00", v: "" }, { t: "2026-11-13 11:00", v: null }] })
    );
    t.after(() => mock.restoreAll());

    const { status, body } = await get("/api/signals");

    assert.equal(status, 200);
    assert.equal(body.status, "no_valid_observations");
    assert.equal(body.processed.summary, null);
    assert.equal(body.quality.excludedRows, 2);
  });
});

describe("GET /api/signals: client errors never reach NOAA", () => {
  it("returns 400 for an unknown station and makes no upstream call", async (t) => {
    mockNoaa(() => jsonResponse(200, GMT_24));
    t.after(() => mock.restoreAll());

    const { status, body } = await get("/api/signals?station=0000000");

    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.code, "invalid_parameter");
    assert.equal(body.details.errors[0].field, "station");
    assert.equal(noaaCalls.length, 0);
  });

  it("returns 400 for a non-numeric range", async (t) => {
    mockNoaa(() => jsonResponse(200, GMT_24));
    t.after(() => mock.restoreAll());

    const { status, body } = await get("/api/signals?range=abc");

    assert.equal(status, 400);
    assert.equal(body.details.errors[0].field, "range");
    assert.equal(noaaCalls.length, 0);
  });

  it("returns 400 for a range of zero, which NOAA would otherwise answer with no data", async (t) => {
    mockNoaa(() => jsonResponse(200, GMT_24));
    t.after(() => mock.restoreAll());

    const { status } = await get("/api/signals?range=0");

    assert.equal(status, 400);
    assert.equal(noaaCalls.length, 0);
  });

  it("returns 400 for a product that is not allowlisted", async (t) => {
    mockNoaa(() => jsonResponse(200, GMT_24));
    t.after(() => mock.restoreAll());

    const { status, body } = await get("/api/signals?product=salinity");

    assert.equal(status, 400);
    assert.equal(body.details.errors[0].field, "product");
    assert.equal(noaaCalls.length, 0);
  });
});

describe("GET /api/signals: upstream failures are sanitized", () => {
  it("returns 502 when NOAA answers HTTP 400, without a stack trace or raw body", async (t) => {
    mockNoaa(() => jsonResponse(400, INVALID_STATION));
    t.after(() => mock.restoreAll());

    const { status, body } = await get("/api/signals");

    assert.equal(status, 502);
    assert.equal(body.code, "upstream_error");
    assert.equal(body.message, "NOAA responded with HTTP 400.");
    assert.equal(body.details.upstreamStatus, 400);
    const serialized = JSON.stringify(body);
    assert.equal(/at \w+ \(|\.js:\d+/.test(serialized), false, "no stack frames");
    assert.equal(serialized.includes(NOAA_DATAGETTER_URL), false, "no NOAA base URL leak in errors");
  });

  it("returns 504 when NOAA does not answer before the timeout", async (t) => {
    process.env.NOAA_TIMEOUT_MS = "20";
    t.after(() => {
      delete process.env.NOAA_TIMEOUT_MS;
      mock.restoreAll();
    });
    mockNoaa((url, options) => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));

    const { status, body } = await get("/api/signals");

    assert.equal(status, 504);
    assert.equal(body.code, "upstream_timeout");
  });

  it("returns 502 when the network call itself fails", async (t) => {
    mockNoaa(() => {
      throw new TypeError("fetch failed");
    });
    t.after(() => mock.restoreAll());

    const { status, body } = await get("/api/signals");

    assert.equal(status, 502);
    assert.equal(body.code, "upstream_unreachable");
  });
});
