// Reverse-proxy handling, checked with real requests and real X-Forwarded-For headers.
//
// The rule under test: with no proxy trusted, X-Forwarded-For is ignored, so a client
// cannot pick its own address and escape a limit. With exactly one trusted proxy, the
// address is the one that proxy appended (the rightmost entry), and entries the client
// added to the left are ignored.

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./helpers/httpApp.js";

// Two requests allowed per minute. range=0 is refused by validation, so each request
// costs only the limiter and never reaches NOAA.
const LIMIT = { limit: 2, windowMs: 60_000 };
const PATH = "/api/signals?range=0";

let app;
afterEach(async () => {
  if (app) await app.close();
  app = null;
});

async function sendWith(forwardedFor) {
  const headers = forwardedFor === undefined ? {} : { "X-Forwarded-For": forwardedFor };
  return (await app.request(PATH, { headers })).status;
}

describe("no trusted proxy (TRUST_PROXY_HOPS unset)", () => {
  it("ignores X-Forwarded-For, so rotating it does not escape the limit", async () => {
    app = await startTestApp({ trustProxyHops: 0, signalOptions: { rateLimit: LIMIT } });
    const statuses = [];
    for (const forged of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) {
      statuses.push(await sendWith(forged));
    }
    assert.deepEqual(statuses, [400, 400, 429]);
  });

  it("ignores a spoofed leftmost entry as well", async () => {
    app = await startTestApp({ trustProxyHops: 0, signalOptions: { rateLimit: LIMIT } });
    const statuses = [];
    for (let i = 1; i <= 3; i += 1) statuses.push(await sendWith(`203.0.113.${i}, 10.0.0.5`));
    assert.deepEqual(statuses, [400, 400, 429]);
  });
});

describe("exactly one trusted proxy (TRUST_PROXY_HOPS=1)", () => {
  it("keys the limit on the address the proxy appended, so distinct clients are limited separately", async () => {
    app = await startTestApp({ trustProxyHops: 1, signalOptions: { rateLimit: LIMIT } });
    const statuses = [];
    for (const client of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) {
      statuses.push(await sendWith(client));
    }
    // Three different clients, each under its own limit.
    assert.deepEqual(statuses, [400, 400, 400]);
  });

  it("ignores entries a client added to the left of the proxy's entry", async () => {
    app = await startTestApp({ trustProxyHops: 1, signalOptions: { rateLimit: LIMIT } });
    const statuses = [];
    for (let i = 1; i <= 3; i += 1) statuses.push(await sendWith(`192.0.2.${i}, 198.51.100.9`));
    // Every request carries the same appended address, so they share one limit.
    assert.deepEqual(statuses, [400, 400, 429]);
  });

  it("still limits a connection that sends no forwarded header at all", async () => {
    app = await startTestApp({ trustProxyHops: 1, signalOptions: { rateLimit: LIMIT } });
    const statuses = [];
    for (let i = 0; i < 3; i += 1) statuses.push(await sendWith(undefined));
    assert.deepEqual(statuses, [400, 400, 429]);
  });
});
