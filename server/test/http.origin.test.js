// Browser origins at the HTTP level. CORS decides which web pages may read a response. The
// write check refuses saves from browser pages on other sites. Neither is authentication:
// the tests send Origin headers themselves, which any client can do.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./helpers/httpApp.js";
import { buildBody, SYNTHETIC_PAYLOAD } from "./helpers/snapshotFixtures.js";

const ALLOWED = "https://noaa.example.org";
const FOREIGN = "https://elsewhere.example.net";

let app;
before(async () => {
  app = await startTestApp({
    allowedOrigins: [ALLOWED, "http://localhost:5173"],
    snapshotOptions: { writeLimit: { limit: 100, windowMs: 60000 } },
  });
});
after(async () => app.close());

function savePost(retrievalId, headers = {}) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ retrievalId }),
  };
}

function freshRetrieval() {
  const { body, points } = buildBody(SYNTHETIC_PAYLOAD);
  return app.retrievals.put({ body, points });
}

describe("CORS: which pages may read responses", () => {
  it("returns Access-Control-Allow-Origin only for an allowed origin, with Vary: Origin", async () => {
    const res = await app.request("/api/health", { headers: { Origin: ALLOWED } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
    assert.match(res.headers.get("vary") ?? "", /Origin/);
  });

  it("gives a foreign origin no allow-origin header, so a browser will not share the response", async () => {
    const res = await app.request("/api/health", { headers: { Origin: FOREIGN } });
    assert.equal(res.status, 200, "the server still answers; the browser is what withholds the response");
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  it("never answers with a wildcard origin", async () => {
    const foreign = await app.request("/api/health", { headers: { Origin: FOREIGN } });
    assert.notEqual(foreign.headers.get("access-control-allow-origin"), "*");
    const none = await app.request("/api/health");
    assert.equal(none.headers.get("access-control-allow-origin"), null);
  });

  it("answers a preflight from an allowed origin with the method it needs", async () => {
    const res = await app.request("/api/snapshots", {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
    assert.match(res.headers.get("access-control-allow-methods"), /POST/);
  });

  it("gives a preflight from a foreign origin no allow headers", async () => {
    const res = await app.request("/api/snapshots", {
      method: "OPTIONS",
      headers: { Origin: FOREIGN, "Access-Control-Request-Method": "POST" },
    });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });
});

describe("writes: a browser page on another site cannot save (this is not authentication)", () => {
  it("refuses a save whose Origin is not allowed, and stores nothing", async () => {
    const retrievalId = freshRetrieval();
    const before = app.count("snapshots");
    const res = await app.request("/api/snapshots", savePost(retrievalId, { Origin: FOREIGN }));
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "origin_not_allowed");
    assert.equal(app.count("snapshots"), before);
    assert.equal(app.retrievals.savedSnapshotId(retrievalId), null);
  });

  it("refuses a save from an opaque origin, the value a sandboxed page sends", async () => {
    const res = await app.request("/api/snapshots", savePost(freshRetrieval(), { Origin: "null" }));
    assert.equal(res.status, 403);
  });

  it("allows a save from an allowed origin", async () => {
    const res = await app.request("/api/snapshots", savePost(freshRetrieval(), { Origin: ALLOWED }));
    assert.equal(res.status, 201);
  });

  it("allows a save with no Origin header, as a script or curl sends it; that path is not a browser check", async () => {
    const res = await app.request("/api/snapshots", savePost(freshRetrieval()));
    assert.equal(res.status, 201);
  });
});

describe("GET /api/signals: a foreign page is not given the response either", () => {
  it("omits the allow-origin header for a foreign origin, and answers before any NOAA call", async () => {
    // range=0 is refused by validation, so no NOAA request is made and no network is used.
    const res = await app.request("/api/signals?range=0", { headers: { Origin: FOREIGN } });
    assert.equal(res.status, 400);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });
});
