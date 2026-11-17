import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SnapshotRequestError,
  buildSnapshotListUrl,
  buildSnapshotUrl,
  fetchSnapshot,
  listSnapshots,
  saveSnapshot,
} from "../src/api/snapshotApi.js";

const RETRIEVAL_ID = "3f1c9a2e-7b4d-4e8a-9c21-5d6e7f8a9b0c";

const META = {
  id: 4,
  stationId: "8454000",
  stationName: "Providence",
  product: "water_temperature",
  requestedHours: 24,
  retrievedAt: "2026-11-14T00:00:00.000Z",
  savedAt: "2026-11-15T10:00:00.000Z",
  sourceMode: "live",
  demoLabel: null,
};

const SIGNAL = { ok: true, status: "ok", station: "8454000", processed: { series: [] } };

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Records every request so a test can assert exactly what left the browser.
function recordingFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetchImpl, calls };
}

async function rejectionOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected the promise to reject");
}

describe("request construction", () => {
  it("builds a bounded list URL with explicit paging", () => {
    assert.equal(buildSnapshotListUrl("", { limit: 10, offset: 20 }), "/api/snapshots?limit=10&offset=20");
  });

  it("refuses page sizes and offsets outside the server's bounds", () => {
    for (const limit of [0, 51, 1.5, "10", Number.NaN]) {
      assert.throws(() => buildSnapshotListUrl("", { limit }), RangeError, `limit ${limit}`);
    }
    for (const offset of [-1, 100001, 2.5]) {
      assert.throws(() => buildSnapshotListUrl("", { offset }), RangeError, `offset ${offset}`);
    }
  });

  it("builds a detail URL only from a positive whole-number ID", () => {
    assert.equal(buildSnapshotUrl("", 4), "/api/snapshots/4");
  });

  it("refuses anything that is not a plain positive ID, so no path can be smuggled in", () => {
    const attempts = [0, -1, 1.5, "4", "4/../signals", "../../etc/passwd", Number.NaN, 10000000000];
    for (const id of attempts) {
      assert.throws(() => buildSnapshotUrl("", id), RangeError, `id ${String(id)}`);
    }
  });
});

describe("saving", () => {
  it("posts only the retrieval ID, as JSON, and returns the saved summary", async () => {
    const { fetchImpl, calls } = recordingFetch(async () => jsonResponse(201, { ok: true, snapshot: META }));

    const saved = await saveSnapshot({ baseUrl: "", retrievalId: RETRIEVAL_ID, fetchImpl });

    assert.equal(saved.id, 4);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/snapshots");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(calls[0].init.body), { retrievalId: RETRIEVAL_ID });
  });

  it("sends nothing when there is no retrieval to save", async () => {
    const { fetchImpl, calls } = recordingFetch(async () => jsonResponse(201, { ok: true, snapshot: META }));
    const error = await rejectionOf(saveSnapshot({ baseUrl: "", retrievalId: undefined, fetchImpl }));
    assert.equal(error.kind, "client");
    assert.equal(calls.length, 0);
  });

  it("passes the server's message and code through when a retrieval has expired", async () => {
    const { fetchImpl } = recordingFetch(async () =>
      jsonResponse(404, {
        ok: false,
        code: "retrieval_not_found",
        message: "That observation set is no longer available. Load the observations again, then save.",
      })
    );
    const error = await rejectionOf(saveSnapshot({ baseUrl: "", retrievalId: RETRIEVAL_ID, fetchImpl }));
    assert.ok(error instanceof SnapshotRequestError);
    assert.equal(error.kind, "http");
    assert.equal(error.httpStatus, 404);
    assert.equal(error.code, "retrieval_not_found");
    assert.match(error.message, /no longer available/);
  });

  it("reports a network failure as network, not as a server error", async () => {
    const { fetchImpl } = recordingFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const error = await rejectionOf(saveSnapshot({ baseUrl: "", retrievalId: RETRIEVAL_ID, fetchImpl }));
    assert.equal(error.kind, "network");
  });

  it("reports a request that never finishes as a timeout", async () => {
    const fetchImpl = (url, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const error = await rejectionOf(
      saveSnapshot({ baseUrl: "", retrievalId: RETRIEVAL_ID, fetchImpl, timeoutMs: 5 })
    );
    assert.equal(error.kind, "timeout");
  });

  it("answers a non-JSON proxy page with the HTTP status instead of a parse error", async () => {
    const { fetchImpl } = recordingFetch(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));
    const error = await rejectionOf(saveSnapshot({ baseUrl: "", retrievalId: RETRIEVAL_ID, fetchImpl }));
    assert.equal(error.kind, "http");
    assert.equal(error.httpStatus, 502);
    assert.equal(error.code, null);
    assert.match(error.message, /HTTP 502/);
  });

  it("rejects a success response that lacks the snapshot summary", async () => {
    const { fetchImpl } = recordingFetch(async () => jsonResponse(201, { ok: true, snapshot: { id: "4" } }));
    const error = await rejectionOf(saveSnapshot({ baseUrl: "", retrievalId: RETRIEVAL_ID, fetchImpl }));
    assert.equal(error.kind, "malformed");
  });

  it("does nothing when the caller has already cancelled", async () => {
    const { fetchImpl, calls } = recordingFetch(async () => jsonResponse(201, { ok: true, snapshot: META }));
    const controller = new AbortController();
    controller.abort();
    const error = await rejectionOf(
      saveSnapshot({ baseUrl: "", retrievalId: RETRIEVAL_ID, fetchImpl, signal: controller.signal })
    );
    assert.equal(error.kind, "aborted");
    assert.equal(calls.length, 0);
  });
});

describe("listing", () => {
  it("requests one bounded page and returns the total with its snapshots", async () => {
    const { fetchImpl, calls } = recordingFetch(async () =>
      jsonResponse(200, { ok: true, total: 12, limit: 10, offset: 0, snapshots: [META] })
    );

    const page = await listSnapshots({ baseUrl: "", limit: 10, offset: 0, fetchImpl });

    assert.equal(calls[0].url, "/api/snapshots?limit=10&offset=0");
    assert.equal(calls[0].init.method, "GET");
    assert.equal(page.total, 12);
    assert.deepEqual(page.snapshots, [META]);
  });

  it("rejects a list whose entries do not have the expected shape", async () => {
    const { fetchImpl } = recordingFetch(async () =>
      jsonResponse(200, { ok: true, total: 1, snapshots: [{ id: 4 }] })
    );
    const error = await rejectionOf(listSnapshots({ baseUrl: "", limit: 10, offset: 0, fetchImpl }));
    assert.equal(error.kind, "malformed");
  });
});

describe("opening a saved copy", () => {
  it("reads one snapshot from the store and never calls the NOAA-backed signal endpoint", async () => {
    const { fetchImpl, calls } = recordingFetch(async () =>
      jsonResponse(200, { ok: true, snapshot: META, signal: SIGNAL })
    );

    const opened = await fetchSnapshot({ baseUrl: "", id: 4, fetchImpl });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/snapshots/4");
    assert.equal(calls[0].url.includes("/api/signals"), false);
    assert.equal(opened.snapshot.id, 4);
    assert.deepEqual(opened.signal, SIGNAL);
  });

  it("rejects a detail response without a rebuilt signal body", async () => {
    const { fetchImpl } = recordingFetch(async () => jsonResponse(200, { ok: true, snapshot: META, signal: { ok: false } }));
    const error = await rejectionOf(fetchSnapshot({ baseUrl: "", id: 4, fetchImpl }));
    assert.equal(error.kind, "malformed");
  });

  it("maps an unknown snapshot to a message from the server", async () => {
    const { fetchImpl } = recordingFetch(async () =>
      jsonResponse(404, { ok: false, code: "snapshot_not_found", message: "No saved snapshot has that ID." })
    );
    const error = await rejectionOf(fetchSnapshot({ baseUrl: "", id: 999, fetchImpl }));
    assert.equal(error.code, "snapshot_not_found");
    assert.equal(error.message, "No saved snapshot has that ID.");
  });
});
