import express from "express";
import { fetchNoaaProduct } from "../adapters/noaaClient.js";
import { STATIONS } from "../config/allowlist.js";
import { ApiError } from "../errors.js";
import { processSignal } from "../pipeline/signalProcessor.js";
import { parseSignalParams } from "../validation/signalParams.js";

export const signalsRouter = express.Router();

// GET /api/signals?station=8454000&product=water_temperature&range=24
//
// Success (HTTP 200):
//   { ok: true, status: "ok" | "empty" | "no_valid_observations", emptyReason, absenceStatus,
//     station, product, range, stationName, source, quality, processed }
// emptyReason is "noaa_no_data_message" when NOAA's no-data text was returned, which
// does not distinguish "no observations in window" from "product not offered here".
// It is "no_rows_returned" when NOAA returned an empty data array, and null otherwise.
// absenceStatus states what may be claimed: "not_established" for NOAA's no-data text
// (the app does NOT claim the window is empty), "rows_absent_in_window" for a valid
// response with zero rows, and null when observations or excluded rows were returned.
// Failure:
//   { ok: false, code, message, details? }
//   400 invalid_parameter | 502 upstream_error | 502 upstream_unreachable |
//   504 upstream_timeout | 500 internal_error
signalsRouter.get("/signals", async (req, res) => {
  try {
    const { station, product, range } = parseSignalParams(req.query);

    const result = await fetchNoaaProduct({ station, product, range, interval: "h" });
    const processed = processSignal(result.points);

    res.json({
      ok: true,
      status: result.status,
      emptyReason: result.emptyReason,
      absenceStatus: result.absenceStatus,
      station,
      product,
      range,
      stationName: result.stationName ?? STATIONS[station]?.name ?? null,
      source: {
        name: "NOAA CO-OPS Data Retrieval API",
        url: result.sourceUrl,
        retrievedAt: result.retrievedAt,
        timeZone: "GMT",
        interval: "hourly",
        noaaMessage: result.noaaMessage,
      },
      quality: result.quality,
      processed,
    });
  } catch (error) {
    sendError(res, error);
  }
});

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
