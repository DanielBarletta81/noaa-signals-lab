import express from "express";
import { fetchNoaaProduct } from "../adapters/noaaClient.js";
import { ApiError } from "../errors.js";
import { createFixedWindowLimiter } from "../http/rateLimit.js";
import { defaultRetrievalStore } from "../retrievals/store.js";
import { buildSignalBody } from "../signals/buildResponse.js";
import { createSignalCache } from "../signals/signalCache.js";
import { parseSignalParams } from "../validation/signalParams.js";

// GET /api/signals?station=8454000&product=water_temperature&range=24
//
// Success (HTTP 200):
//   { ok: true, status: "ok" | "empty" | "no_valid_observations", emptyReason, absenceStatus,
//     station, product, range, stationName, source, quality, processed, retrievalId,
//     cache }
// emptyReason is "noaa_no_data_message" when NOAA's no-data text was returned, which
// does not distinguish "no observations in window" from "product not offered here".
// It is "no_rows_returned" when NOAA returned an empty data array, and null otherwise.
// absenceStatus states what may be claimed: "not_established" for NOAA's no-data text
// (the app does NOT claim the window is empty), "rows_absent_in_window" for a valid
// response with zero rows, and null when observations or excluded rows were returned.
// retrievalId identifies this retrieval for the save action. It is short-lived and is
// not stored in the database. It is not authorization.
// cache: { status: "miss" | "hit" | "shared", fetchedAt, storedAt, expiresAt, maxAgeSeconds }
//   miss    this request asked NOAA
//   hit     served from the server's cache, without asking NOAA again
//   shared  joined an identical NOAA request that another visitor had already started
//   fetchedAt is when NOAA was asked (source.retrievedAt). storedAt and expiresAt bound the
//   cache entry. The body is otherwise identical to a fresh response. Cache metadata is
//   not part of a saved copy.
// Failure:
//   { ok: false, code, message, details? }
//   400 invalid_parameter | 429 rate_limited | 502 upstream_error | 502 upstream_unreachable |
//   504 upstream_timeout | 500 internal_error
//
// Requests are limited per connection address (see SIGNAL_RATE_LIMIT). The limit applies
// before the cache, so a cache hit still counts. Every response is Cache-Control: no-store,
// so a browser or intermediary never keeps a retrievalId beyond its own use.
export const SIGNAL_RATE_LIMIT = Object.freeze({ limit: 30, windowMs: 60 * 1000 });

export function createSignalsRouter({
  retrievals = defaultRetrievalStore,
  cache = createSignalCache(),
  rateLimit = SIGNAL_RATE_LIMIT,
} = {}) {
  const router = express.Router();
  const limiter = rateLimit ? createFixedWindowLimiter(rateLimit) : null;

  router.get("/signals", async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      if (limiter) {
        const admission = limiter.hit(req.ip ?? "unknown");
        if (!admission.allowed) {
          res.set("Retry-After", String(admission.retryAfterSeconds));
          throw new ApiError(
            429,
            "rate_limited",
            "Too many observation requests from this connection. Wait a moment, then try again."
          );
        }
      }

      const params = parseSignalParams(req.query);
      const key = `${params.station}|${params.product}|${params.range}`;

      // A cached entry is reused only while its retrieval is still held, so the
      // retrievalId in the response can always be saved.
      const cached = cache.get(key);
      if (cached && retrievals.get(cached.value.retrievalId) !== null) {
        sendSignal(res, cached.value, {
          status: "hit",
          storedAtMs: cached.storedAtMs,
          expiresAtMs: cached.expiresAtMs,
          ttlMs: cache.ttlMs,
        });
        return;
      }
      cache.forget(key);

      const { value, shared } = await cache.coalesce(key, () => loadFresh(params, key, { retrievals, cache }));
      const stored = cache.get(key) ?? { storedAtMs: Date.now(), expiresAtMs: Date.now() };
      sendSignal(res, value, {
        status: shared ? "shared" : "miss",
        storedAtMs: stored.storedAtMs,
        expiresAtMs: stored.expiresAtMs,
        ttlMs: cache.ttlMs,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

// The default router reads NOAA for every request. Tests use it to check each NOAA call,
// so it has no cache and no limit. Production uses createApp, which sets both.
export const signalsRouter = createSignalsRouter({
  cache: createSignalCache({ ttlMs: 0 }),
  rateLimit: null,
});

async function loadFresh({ station, product, range }, key, { retrievals, cache }) {
  const result = await fetchNoaaProduct({ station, product, range, interval: "h" });
  const body = buildSignalBody({ station, product, range, result });
  const retrievalId = retrievals.put({ body, points: result.points });
  const value = { body, retrievalId };
  cache.set(key, value);
  return value;
}

function sendSignal(res, value, { status, storedAtMs, expiresAtMs, ttlMs }) {
  res.json({
    ...value.body,
    retrievalId: value.retrievalId,
    cache: {
      status,
      fetchedAt: value.body.source.retrievedAt,
      storedAt: new Date(storedAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      maxAgeSeconds: Math.round(ttlMs / 1000),
    },
  });
}

function sendError(res, error) {
  if (error instanceof ApiError) {
    const body = { ok: false, code: error.code, message: error.publicMessage };
    if (error.details && Object.keys(error.details).length > 0) {
      body.details = error.details;
    }
    res.status(error.status).json(body);
    return;
  }

  // Unexpected failure: log the full error on the server only. Return a generic
  // message so no stack trace or internal detail reaches the browser.
  console.error("Unexpected error in GET /api/signals:", error);
  res.status(500).json({
    ok: false,
    code: "internal_error",
    message: "Unexpected server error.",
  });
}
