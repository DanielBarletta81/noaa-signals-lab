# NOAA Signal Explorer

A modern visualization and interpretation layer for NOAA coastal station data.

## Overview

NOAA Signal Explorer fetches coastal observations from the NOAA CO-OPS Data Retrieval API, checks and normalizes them, and shows the measured values with their UTC timestamps, data-quality counts, and limits. It does not classify water temperature as healthy or harmful.

This project is the real-data sibling of Estuary Signal Lab.

## Current scope

- Station: Providence, RI (NOAA station `8454000`; the name comes from NOAA's station metadata)
- Product: `water_temperature`, in °C
- Window: the last 1 to 72 hours (default 24), one observation per hour
- Shown: latest value and time (UTC), min, max, mean, sample count, a chart, data-quality counts, and the limits of the summary
- Not yet: a time-window trend (the old last-step "trend" was removed), ecological interpretation, multiple stations, filtering by NOAA quality flags

See `docs/DATA_DICTIONARY.md` for every field, the timestamp policy, exclusion reasons, and how NOAA "no data" responses are classified.

## Architecture

```txt
NOAA API
  → NOAA adapter        server/src/adapters/noaaClient.js
  → signal processor    server/src/pipeline/signalProcessor.js
  → insight text        server/src/pipeline/insightEngine.js
  → Express API         server/src/routes/signals.js   (mounted at /api)
  → React dashboard     client/src
```

Frontend: React, Vite, Recharts 2.15.x
Backend: Node.js, Express 4, NOAA CO-OPS adapter

## Requirements

- **Node.js 22.** The verified version is in `.nvmrc` (22.23.5). With nvm, run `nvm use` in the repository root. Node 23 works but prints `EBADENGINE` warnings from ESLint's own dependencies, and that output is not from this project's code.
- npm 11 was used for verification (11.8.0).

## Setup

Install each package from its lockfile. Use `npm ci`, not `npm install`:

```sh
npm ci                 # root: installs concurrently, used by "npm run dev"
(cd server && npm ci)
(cd client && npm ci)
```

Run the server and the client together:

```sh
npm run dev
```

- Server: http://localhost:4200 (`GET /api/health` to check it)
- Client: http://localhost:5173. Its `/api` requests are forwarded to the server by the Vite proxy.

## Verify

```sh
(cd server && npm test)                                # server tests (node:test)
(cd client && npm test && npm run lint && npm run build)
curl -i http://localhost:4200/api/health
curl -i 'http://localhost:4200/api/signals?station=8454000&product=water_temperature&range=24'
```

## Configuration

| Variable | Set where | Default | Purpose |
|---|---|---|---|
| `PORT` | server environment | `4200` | Port for the Express server |
| `NOAA_TIMEOUT_MS` | server environment | `8000` | Time allowed for each NOAA request (1 to 60000) |
| `API_PROXY_TARGET` | shell, for `npm run dev` or `preview` in `client/` | `http://localhost:4200` | Where the Vite proxy forwards `/api` |
| `VITE_API_BASE_URL` | `client/.env.local`, at build time | empty (same origin) | API origin for a deployed build. Must be `https`, except `http://localhost`. See `client/.env.example`. |

`VITE_API_BASE_URL` is compiled into the public JavaScript bundle. Never put secrets in any `VITE_` variable.

## API

`GET /api/signals?station=8454000&product=water_temperature&range=24`

| Status | Meaning |
|---|---|
| 200 `status: "ok"` | At least one observation was accepted |
| 200 `status: "empty"` | NOAA returned a valid response with no rows. `absenceStatus` is `rows_absent_in_window`. |
| 200 `status: "empty"`, `emptyReason: "noaa_no_data_message"` | NOAA returned its no-data text. This does not prove the window was empty. `absenceStatus` is `not_established`. |
| 200 `status: "no_valid_observations"` | Rows were returned, but all were excluded |
| 400 `invalid_parameter` | A station, product, or range is not on the allowlist (only `8454000`, `water_temperature`, 1 to 72 hours) |
| 502 `upstream_error` / `upstream_unreachable` | NOAA failed or could not be reached |
| 504 `upstream_timeout` | NOAA did not respond in time |

## Why This Exists

Scientific data is often available but difficult to interpret quickly. This project focuses on the missing layer between raw environmental observations and human understanding.

## Future Work

- Salinity and water-level support
- Multi-station comparison
- Time-window trend (delta and slope in °C per hour, with coverage rules)
- Narragansett Bay map layer
- Estuary health scoring
- Reusable NOAA JavaScript client
- Documentation examples for scientific developers

## Author

Daniel Barletta
