import express from "express";
import { fetchNoaaProduct } from "../adapters/noaaClient.js";
import { ApiError } from "../errors.js";
import { defaultRetrievalStore } from "../retrievals/store.js";
import { buildSignalBody } from "../signals/buildResponse.js";
import { parseSignalParams } from "../validation/signalParams.js";

// GET /api/signals?station=8454000&product=water_temperature&range=24
//
// Success (HTTP 200):
//   { ok: true, status: "ok" | "empty" | "no_valid_observations", emptyReason, absenceStatus,
//     station, product, range, stationName, source, quality, processed, retrievalId }
// emptyReason is "noaa_no_data_message" when NOAA's no-data text was returned, which
// does not distinguish "no observations in window" from "product not offered here".
// It is "no_rows_returned" when NOAA returned an empty data array, and null otherwise.
// absenceStatus states what may be claimed: "not_established" for NOAA's no-data text
// (the app does NOT claim the window is empty), "rows_absent_in_window" for a valid
// response with zero rows, and null when observations or excluded rows were returned.
// retrievalId identifies this retrieval for the save action. It is short-lived and is
// not stored in the database.
// Failure:
//   { ok: false, code, message, details? }
//   400 invalid_parameter | 502 upstream_error | 502 upstream_unreachable |
//   504 upstream_timeout | 500 internal_error
export function createSignalsRouter({ retrievals = defaultRetrievalStore } = {}) {
  const router = express.Router();

  router.get("/signals", async (req, res) => {
    try {
      const { station, product, range } = parseSignalParams(req.query);
      const result = await fetchNoaaProduct({ station, product, range, interval: "h" });
      const body = buildSignalBody({ station, product, range, result });
      const retrievalId = retrievals.put({ body, points: result.points });
      res.json({ ...body, retrievalId });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export const signalsRouter = createSignalsRouter();

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
