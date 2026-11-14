# NOAA Signal Explorer

A modern visualization and interpretation layer for NOAA coastal station data.

![Demonstration of the Observatory Ledger layout at desktop width: the latest measured water temperature (11.9 °C at 14 Nov 2026, 00:00 UTC) above a chart of 24 accepted hourly observations, a coverage strip, and context panels. Demonstration only: the values come from a captured NOAA response served by a local demonstration API, not from a live request.](docs/media/demo-observation-desktop.png)

*Demonstration, not live data.* The image above was rendered from a captured NOAA response (see `server/test/fixtures/`). It was served through the real Express route and processing code by a local demonstration harness that lives outside this repository and is not committed. The live page shows what NOAA returns when you load it; a live capture is at `docs/media/live-observation-desktop.png`, and the time it was taken is printed on the page.

Other media in `docs/media/`:
- `demo-before-redesign-desktop.png`: the previous interface, for comparison (demonstration data).
- `demo-excluded-and-missing-hours-desktop.png`: a modified capture with one blank value and one missing hour (demonstration data).
- `demo-timeout-error-desktop.png`, `demo-no-data-desktop.png`, `demo-observation-mobile.png`: demonstration states.
- `demo-keyboard-interaction.gif`: four keyboard-driven frames (latest, excluded hour, missing hour, back to latest). It is not a continuous recording.

## Overview

NOAA Signal Explorer fetches coastal observations from the NOAA CO-OPS Data Retrieval API, checks and normalizes them, and shows the measured values with their UTC timestamps, data-quality counts, and limits. It does not classify water temperature as healthy or harmful.

This project is the real-data sibling of Estuary Signal Lab.

## What the page shows, and how to read it

Each part of the page answers one question, in this order:

1. **Observation.** The latest accepted value, in large numerals with its UTC time. Select any hour in the coverage strip to read that hour's status instead.
2. **Context.** Derived summary numbers (mean, minimum, maximum, accepted count), and the limits of the summary.
3. **Data quality.** Rows received, used, and excluded, with the reason for each exclusion. Quality flags are kept but not interpreted.
4. **Methodology.** What was requested, how each row was accepted or excluded, and what is not calculated.

The coverage strip uses one shape per hour, not colour alone:

| Shape on the strip | Meaning | What the page shows for it |
|---|---|---|
| Solid sea-glass block | NOAA returned a row, and it passed validation | Its measured value |
| Hatched block (clay) | NOAA returned a row, but it was excluded (for example, a blank value) | No value. It is never plotted or treated as zero. |
| Dashed outline | NOAA returned no row for that hour | No value. Nothing is estimated. |

The chart connects measured hours with straight segments. It does not draw a smooth curve, because a curve would imply values between the measured hours.

Error and empty states are described in their own panels. "NOAA reported no data" is deliberately not reported as "no observations," because NOAA's response does not say which of the two it means.

## Accessibility

- The hourly strip is a set of buttons with one tab stop. Arrow keys move between hours, Home and End jump to the ends, and Enter selects an hour.
- Every hour has a full accessible name, such as "14 Nov 2026, 14:00 UTC: no row returned by NOAA."
- Focus is shown with a 3 px high-contrast outline. A skip link moves focus to the observation.
- Under `prefers-reduced-motion`, transitions, the entrance animation, and chart animation are turned off.
- Phone-width hour targets are at least 24 CSS px. The palette is checked against WCAG 2.x contrast in the test suite.
- A table of every hour, with its status and value, sits under the chart, so no information is available only as a picture.

These checks were run in a browser; see *Verification status* below for exactly what was and was not tested.

## Verification status

| Check | Status |
|---|---|
| Server tests (`node --test`) | 137 pass, 0 fail |
| Client tests (`node --test`) | 71 pass, 0 fail |
| Client lint and production build | Pass |
| Browser keyboard, focus, reduced-motion, and target-size checks (Chrome 157, scripted) | 20 of 20 pass |
| axe-core (WCAG 2.x A and AA) on 21 captures (7 states × 3 widths) | 0 violations |
| Screen-reader testing (VoiceOver, NVDA) | **Not done** |
| Full WCAG conformance audit | **Not done**. No compliance claim is made. |
| Continuous screen recording | **Not done**. The GIF is assembled from four keyboard-driven frames. |

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
