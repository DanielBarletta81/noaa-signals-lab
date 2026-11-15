// Builds the body returned by GET /api/signals from one normalized NOAA retrieval.
// Shared by the live route and by saved-snapshot reopening, so a reopened snapshot is
// assembled by the same code path as a live response.

import { STATIONS } from "../config/allowlist.js";
import { processSignal } from "../pipeline/signalProcessor.js";

export const SOURCE_NAME = "NOAA CO-OPS Data Retrieval API";

// result: the object returned by fetchNoaaProduct, or the same shape rebuilt from a
// saved snapshot: { status, emptyReason, absenceStatus, points, stationName, sourceUrl,
// retrievedAt, quality, noaaMessage }.
export function buildSignalBody({ station, product, range, result }) {
  return {
    ok: true,
    status: result.status,
    emptyReason: result.emptyReason,
    absenceStatus: result.absenceStatus,
    station,
    product,
    range,
    stationName: result.stationName ?? STATIONS[station]?.name ?? null,
    source: {
      name: SOURCE_NAME,
      url: result.sourceUrl,
      retrievedAt: result.retrievedAt,
      timeZone: "GMT",
      interval: "hourly",
      noaaMessage: result.noaaMessage,
    },
    quality: result.quality,
    processed: processSignal(result.points),
  };
}
