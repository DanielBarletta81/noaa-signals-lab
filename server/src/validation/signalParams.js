// Validates /api/signals query parameters against the allowlist in
// config/allowlist.js. Every problem is reported in one ValidationError so a
// caller can fix all of them at once. No NOAA request is made when this fails.

import {
  ALLOWED_QUERY_PARAMS,
  DEFAULT_PRODUCT,
  DEFAULT_STATION,
  PRODUCTS,
  RANGE_HOURS,
  STATIONS,
} from "../config/allowlist.js";
import { ValidationError } from "../errors.js";

const INTEGER_PATTERN = /^\d+$/;

export function parseSignalParams(query = {}) {
  const errors = [];

  for (const key of Object.keys(query)) {
    if (!ALLOWED_QUERY_PARAMS.includes(key)) {
      errors.push({ field: key, message: "Unknown query parameter." });
    }
  }

  const station = readSingleString(query, "station", DEFAULT_STATION, errors);
  if (station !== null && !Object.hasOwn(STATIONS, station)) {
    errors.push({
      field: "station",
      message: `Unsupported station. Allowed: ${Object.keys(STATIONS).join(", ")}.`,
    });
  }

  const product = readSingleString(query, "product", DEFAULT_PRODUCT, errors);
  if (product !== null && !Object.hasOwn(PRODUCTS, product)) {
    errors.push({
      field: "product",
      message: `Unsupported product. Allowed: ${Object.keys(PRODUCTS).join(", ")}.`,
    });
  }

  const range = readRange(query, errors);

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return { station, product, range };
}

// Returns the string value, the default if absent, or null after recording an error.
function readSingleString(query, field, defaultValue, errors) {
  if (!Object.hasOwn(query, field)) return defaultValue;

  const value = query[field];
  if (typeof value !== "string") {
    errors.push({ field, message: "Provide this parameter exactly once." });
    return null;
  }
  if (value.length === 0) {
    errors.push({ field, message: "Must not be empty." });
    return null;
  }
  return value;
}

// Accepts only plain base-10 digits, so "24.5", "1e2", " 24", "-1", and "0x18"
// are all rejected. Returns the number, or null after recording an error.
function readRange(query, errors) {
  const field = "range";
  if (!Object.hasOwn(query, field)) return RANGE_HOURS.default;

  const value = query[field];
  if (typeof value !== "string" || !INTEGER_PATTERN.test(value)) {
    errors.push({
      field,
      message: `Must be a whole number of hours from ${RANGE_HOURS.min} to ${RANGE_HOURS.max}.`,
    });
    return null;
  }

  const hours = Number(value);
  if (hours < RANGE_HOURS.min || hours > RANGE_HOURS.max) {
    errors.push({
      field,
      message: `Must be a whole number of hours from ${RANGE_HOURS.min} to ${RANGE_HOURS.max}.`,
    });
    return null;
  }
  return hours;
}
