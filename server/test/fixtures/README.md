# Test fixtures: provenance

These files are captured or constructed inputs for the server test suite. They are not
analysis outputs. Re-capture them only deliberately, and record the date when you do.

| File | Source | Captured | Notes |
|---|---|---|---|
| `noaa-8454000-water_temperature-gmt-24h.json` | Live NOAA CO-OPS datagetter, `station=8454000&product=water_temperature&range=24&interval=h&units=metric&time_zone=gmt` | 2026-11-13, approx. 00:00 UTC on 2026-11-14 | 24 hourly rows, metadata name "Providence". Values are real observations, not edited. |
| `noaa-8454000-water_temperature-nodata-2030.json` | Live NOAA, same station and product with `begin_date=20300101&end_date=20300102&time_zone=gmt` | 2026-11-13 | HTTP 200 with an `error` object: "No data was found. This product may not be offered at this station at the requested time." |
| `noaa-error-invalid-station-http400.json` | Live NOAA, `station=0000000` | 2026-11-13 | HTTP 400 with an `error` object. |

Synthetic arithmetic inputs are written inline inside the test files and are labeled
`SYNTHETIC` there. They are never presented as observations.
