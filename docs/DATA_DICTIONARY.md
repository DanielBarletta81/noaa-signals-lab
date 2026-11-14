# Data dictionary and interpretation policy

This document describes what the NOAA Signal Explorer API returns, what each field means, and what the app does and does not claim. It describes the current code. It is not a finding.

Scope: station `8454000` (Providence, RI), product `water_temperature`, metric units (°C), hourly interval, 1 to 72 hours. Source: NOAA CO-OPS Data Retrieval API, `datagetter`.

## Response fields

| Field | Meaning | Source |
|---|---|---|
| `status` | `ok` (at least one accepted point), `empty` (no plottable points; see `emptyReason` and `absenceStatus` for what may be claimed), or `no_valid_observations` (rows received but all excluded) | Computed |
| `emptyReason` | `noaa_no_data_message` (NOAA's "No data was found" text), `no_rows_returned` (empty `data` array), or `null` | Computed |
| `absenceStatus` | What may be claimed about the window. `rows_absent_in_window`: NOAA returned a valid response with zero rows. `not_established`: NOAA returned its no-data text, so the app does not claim the window is empty. `null`: observations or excluded rows were returned. | Computed |
| `stationName` | NOAA metadata name for the station, as returned in the data response | NOAA `metadata.name` |
| `source.url` | The exact request URL sent to NOAA (no credentials) | Computed |
| `source.retrievedAt` | Server time when the response was received (UTC ISO 8601) | Computed |
| `source.timeZone` | Always `GMT`. The request sets `time_zone=gmt`. | Request parameter |
| `source.noaaMessage` | NOAA's sanitized error text, when NOAA returned one | NOAA `error.message` |
| `quality.receivedRows` | Number of rows in NOAA's `data` array | NOAA |
| `quality.acceptedRows` | Rows that became points | Computed |
| `quality.excludedRows` | Rows not used, with a reason each. `receivedRows = acceptedRows + excludedRows`. | Computed |
| `quality.excludedByReason` | Count per exclusion reason (see below) | Computed |
| `quality.flagPolicy` | Always `preserved_not_interpreted` | Constant |
| `processed.series[].time` | Observation time, UTC ISO 8601 | Converted from NOAA `t` |
| `processed.series[].value` | Measured water temperature, °C | NOAA `v`, parsed |
| `processed.summary` | Latest value and time, min, max, mean, and count over accepted points | Computed |
| `processed.trend` | Always `{status: "suppressed"}`. No time-window trend is computed yet. | Constant |
| `processed.insight` | Neutral sentence restating measured values (see Interpretation policy) | Computed |
| `processed.limitations` | Fixed list of caveats shown with the insight | Constant |

## Point fields (`quality` and `processed.latest` use these)

| Field | Meaning |
|---|---|
| `timestampUtc` | Observation time as an explicit UTC instant |
| `observedAtRaw` | NOAA's `t` string exactly as received. Because the request is GMT, this is the UTC wall-clock time without an offset. |
| `value` | Parsed number in °C. A genuine `0` is kept as `0`. |
| `rawValue` | NOAA's `v` string exactly as received |
| `flags.quality` | NOAA `q` value, or `null` when absent. **Not interpreted.** |
| `flags.flag` | NOAA `f` value (for example `"0,0,0"`), or `null`. **Not interpreted.** |

## Timestamps

- NOAA returns `"YYYY-MM-DD HH:mm"` with no offset when `time_zone=gmt`.
- The parser (`server/src/time/noaaTime.js`) accepts only that exact format, with valid calendar dates and hours 00 to 23, minutes 00 to 59. It converts with `Date.UTC` and checks the round trip, which rejects impossible dates such as `2026-02-29`.
- Rows with unparseable timestamps are excluded with reason `malformed_timestamp`.
- Points are sorted by UTC instant, so a window that crosses midnight stays in order.

Why GMT: the earlier request used local standard/daylight time, which has no offset in the text. On the autumn DST date, one local clock hour occurs twice, so local strings are ambiguous. GMT strings are not.

## Exclusion reasons

A row is excluded (never plotted, never treated as zero) for one of these reasons:

| Reason | Meaning |
|---|---|
| `malformed_row` | The row is not an object |
| `malformed_timestamp` | `t` is not a valid GMT string |
| `missing_value` | `v` is absent or `null` |
| `blank_value` | `v` is an empty or whitespace-only string |
| `malformed_value` | `v` is not a plain decimal number (for example `"abc"`, `"1,2"`, `"1e3"`) |
| `non_finite_value` | `v` is `NaN` or `Infinity` |
| `duplicate_timestamp` | A later row has the same UTC instant as an earlier one. The first row is kept. This rule is an assumption, not a verified NOAA convention. |

## No-data classification

NOAA returns HTTP 200 with `{"error":{"message":"No data was found. This product may not be offered at this station at the requested time."}}` when a valid request has no data.

This message covers two different situations:
1. There are no observations in the requested window.
2. The product is not offered at this station at the requested time.

NOAA's response does not let the app tell these apart, so the app does not claim either one. It reports `status: "empty"`, `emptyReason: "noaa_no_data_message"`, and `absenceStatus: "not_established"`, and it shows NOAA's text. The UI says the cases cannot be distinguished and that the page does not claim the window was empty.

The second situation is an unsupported product. The product allowlist (`water_temperature` only) blocks other products with a 400 before NOAA is called. So this path can arise only for an allowed product at a station that does not offer it at the requested time, and it looks the same as case 1.

A valid NOAA response with an empty `data` array is different: it is reported as `emptyReason: "no_rows_returned"` and `absenceStatus: "rows_absent_in_window"`. That is the only case where the app states that NOAA returned no rows for the window.

Only that exact message (case-sensitive, at the start of the text) is treated as empty. Near-miss wording, including different capitalization, is an upstream error (502), so an unexpected NOAA message is not silently read as "no data".

## Interpretation policy

The insight panel restates measured values. It does not:
- Judge water temperature as healthy, harmful, elevated, low, moderate, or unusual.
- Infer oxygen levels, metabolic stress, feeding, habitat, bloom, or fish movement.
- Compare against a threshold. The earlier 26 °C and 8 °C thresholds had no cited source and were removed.

Ecological or regulatory interpretation requires a cited, site-specific criterion, a season and depth context, and a method for trends. None of these exist yet. Until they do, the app shows values, times, counts, and limits.

## Quality flags

NOAA's `f` and `q` fields are copied into every point unchanged. This project has not verified what their values mean. So:
- No row is filtered by its flags.
- Flagged readings appear in the summary and chart.
- The UI and response state that flags are not yet interpreted.

Before flags are used for filtering, their meanings must be confirmed against NOAA's CO-OPS documentation, and the policy must be documented here.

## Limits of the current version

- One station and one product.
- No time-window trend. The former last-step "trend" was removed because it misrepresented multi-hour change.
- Sensor depth for station 8454000 has not been confirmed.
- Tidal and diurnal cycles affect a 24-hour window. No tide correction is applied.
- No comparison with historical or climatological values.

## Reproducing the environment

- Node.js: clean `npm ci`, test, lint, and build were run on `v22.23.5` (no `EBADENGINE` warnings) and on `v23.7.0` (50 `EBADENGINE` warnings, all from ESLint's own dependencies, which declare `^20.19.0 || ^22.13.0 || >=24`). Vite 8 requires `^20.19.0 || >=22.12.0`. Node 24 is within the stated ranges but was not run here.
- `server`: `npm ci`, then `npm test`.
- `client`: `npm ci`, then `npm run lint` and `npm run build`.
- The root `package.json` is not used by the server or client builds. Its status is an open question for the maintainer (the working-tree change removes dependencies that the committed version listed).
