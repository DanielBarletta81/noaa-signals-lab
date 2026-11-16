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

## Excluded rows (`quality.excluded`)

| Field | Meaning |
|---|---|
| `index` | Zero-based position of the row in NOAA's `data` array. A duplicate-timestamp exclusion carries the position of the later row. Earlier builds reported `null` for these. |
| `reason` | One of the exclusion reasons above |
| `rawTimestamp` | NOAA's `t` text as received, or `null` |
| `rawValue` | NOAA's `v` text as received, or `null` |
| `flags` | `{quality, flag}`: NOAA's `q` and `f` for the row. Not interpreted. Earlier builds did not attach flags to excluded rows. |

The list is sorted by `index`, so exclusions appear in NOAA's order. The acceptance rules are unchanged.

## Accepted rows (`quality.accepted`)

Added on 2026-11-15. It lists each accepted row in NOAA's `data` order. `quality.accepted` and `quality.excluded` together give every row NOAA returned, once each, at its `index`. `processed.series` is in time order and does not carry these fields.

| Field | Meaning |
|---|---|
| `rowIndex` | Zero-based position of the row in NOAA's `data` array |
| `observedAtRaw` | NOAA's `t` text as received, for example `"2026-11-15 01:00"`. Time zone is GMT, because the request sets `time_zone=gmt`. |
| `timestampUtc` | The same instant as an ISO 8601 UTC string, parsed without the JavaScript string parser |
| `value` | The parsed number, in °C for `water_temperature` (`units=metric`) |
| `rawValue` | NOAA's `v` as received: a string such as `"12.30"`, or a number. The text is not reformatted, so `"12.30"` stays `"12.30"`. |
| `flags` | `{quality, flag}`: NOAA's `q` and `f` for the row. `null` when NOAA sent no value for that field. Not interpreted. |

Duplicate-timestamp rows are not accepted. The first row for each hour in NOAA's order is accepted, and the later one is listed in `quality.excluded` with `duplicate_timestamp`. That is an assumption, not a verified NOAA rule.

Non-scalar `t` or `v` values (objects or arrays) are recorded as `null`, so their original shape is not kept. NOAA's documented responses use strings and numbers only.

## Observation cache (`cache`, on `GET /api/signals`)

Added on 2026-11-15. Describes how this response was delivered. It is not part of the observations, and a saved copy does not store it.

| Field | Meaning |
|---|---|
| `status` | `miss`: this request asked NOAA. `hit`: served from the server's cache. `shared`: joined an identical NOAA request already in progress. |
| `fetchedAt` | When NOAA was asked. Equal to `source.retrievedAt`, which the page shows as the retrieval time. |
| `storedAt` | When this cache entry was stored (ISO 8601 UTC). |
| `expiresAt` | When this entry stops being used (ISO 8601 UTC). Five minutes after `storedAt`. |
| `maxAgeSeconds` | `300`. |

A cached body is otherwise identical to a fresh one. Errors are not cached. An entry is used only while its retrieval is still held, so the `retrievalId` in a cached response can be saved.

## Bounds on NOAA responses and saved copies

| Limit | Value | Result when exceeded |
|---|---|---|
| NOAA response size | 256 KB | `502 upstream_error` (checked while the body is read) |
| NOAA rows per response | 200 | `502 upstream_error` |
| Rows in one saved copy | 200 | `413 snapshot_too_large` |
| Stored text in one copy (JSON bytes of raw timestamps, raw values, flags, source fields) | 64 KB | `413 snapshot_too_large`, nothing written |
| Request body for a save | 1 KB | `413 request_too_large` |
| Copies in the archive | `SNAPSHOT_MAX_COUNT` (default 500) | `507 archive_full`, nothing written, nothing removed |

Measured on Node 22.23.5: a typical 24-hour copy has about 1.8 KB of stored text and takes about 4 KB on disk. The largest accepted copy (200 rows at the 64 KB text bound) takes about 74 KB on disk. These are measurements, not guarantees. Total disk use is `SNAPSHOT_MAX_COUNT` multiplied by the size of the copies actually saved.

## Saved snapshots (SQLite)

Snapshots live in `server/data/noaa-signals.sqlite` by default, or at `SNAPSHOT_DB_PATH`. Migrations are numbered SQL files in `server/src/db/migrations/`. `PRAGMA user_version` records the schema version, and the server refuses a database written by a newer version.

The archive is shared. There are no owners or accounts. Snapshot IDs are sequential integers and are listed for anyone. At most `SNAPSHOT_MAX_COUNT` copies are stored (default 500), and a save beyond that is refused with 507 `archive_full`. Nothing is deleted automatically. Retrieval IDs are never stored in the database.

| Table | Purpose |
|---|---|
| `snapshots` | One row per save: station, product, requested window, NOAA status, source name and URL, `retrieved_at` (the original NOAA retrieval), `saved_at` (when the copy was saved), `source_mode`, `demo_label`, and row counts. A CHECK constraint enforces `received_rows = accepted_rows + excluded_rows`. |
| `observations` | One row per NOAA row, in NOAA's order (`row_order`). Accepted and excluded rows are both stored. `observed_at_utc` is null when the timestamp could not be read. `value` is null unless the row was accepted. `exclusion_reason` is set for excluded rows. `flag_quality` and `flag_flag` hold NOAA's `q` and `f` as JSON text. |

Constraints: `observations.snapshot_id` references `snapshots.id` with `ON DELETE CASCADE`, and foreign keys are enabled. Each save is one transaction, so a snapshot and its observations are stored together or not at all. The capacity check runs inside the same transaction. All SQL is parameterized.

`source_mode` is `live` (saved from a response the app retrieved) or `demonstration` (a captured fixture, labelled with `demo_label`). A demonstration copy's `retrieved_at` is the approximate capture time stated in its label, not a live retrieval.

Storage cost, measured on Node 22.23.5: about 4 KB on disk per 24-hour copy, and about 74 KB for the largest accepted copy. See "Bounds on NOAA responses and saved copies".
