// Documented allowlist for the API. Requests outside these values are rejected
// with HTTP 400 before any NOAA call is made.
//
// Milestone 3 scope: one verified station and one product.
// - Station 8454000: NOAA metadata name "Providence" (verified 2026-11-13 via
//   https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8454000.json).
// - Product water_temperature: returned in °C when units=metric.
//
// Adding a station or product requires confirming, in NOAA's station inventory
// and product documentation, that the station offers that product.

export const STATIONS = Object.freeze({
  "8454000": Object.freeze({ id: "8454000", name: "Providence" }),
});

export const PRODUCTS = Object.freeze({
  water_temperature: Object.freeze({ id: "water_temperature", units: "°C" }),
});

// Window length in whole hours. NOAA returns one row per hour (interval=h).
// 72 h upper bound: verified that NOAA returns 72 rows for range=72.
export const RANGE_HOURS = Object.freeze({ min: 1, max: 72, default: 24 });

export const DEFAULT_STATION = "8454000";
export const DEFAULT_PRODUCT = "water_temperature";

// Only these query parameters are accepted. Anything else is a client error.
export const ALLOWED_QUERY_PARAMS = Object.freeze(["station", "product", "range"]);
