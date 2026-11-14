# NOAA Signals Lab

**Observed coastal water temperature, presented with explicit data quality and scientific limitations.**

A modern visualization and interpretation layer for NOAA coastal station data.

![Demonstration of the Observatory Ledger layout at desktop width: the latest measured water temperature (11.9 °C at 14 Nov 2026, 00:00 UTC) above a chart of 24 accepted hourly observations, a coverage strip, and context panels. Demonstration only: the values come from a captured NOAA response served by a local demonstration API, not from a live request.](docs/media/demo-observation-desktop.png)

*Demonstration, not live data.* The image above was rendered from a captured NOAA response (see `server/test/fixtures/`). It was served through the real Express route and processing code by a local demonstration harness that lives outside this repository and is not committed. The live page shows what NOAA returns when you load it; a live capture is at `docs/media/live-observation-desktop.png`, and the time it was taken is printed on the page.

Other media in `docs/media/`:
- `demo-before-redesign-desktop.png`: the previous interface, for comparison (demonstration data).
- `demo-excluded-and-missing-hours-desktop.png`: a modified capture with one blank value and one missing hour (demonstration data).
- `demo-timeout-error-desktop.png`, `demo-no-data-desktop.png`, `demo-observation-mobile.png`: demonstration states.
- `demo-keyboard-interaction.gif`: four keyboard-driven frames (latest, excluded hour, missing hour, back to latest). It is not a continuous recording.

NOAA Signals Lab retrieves public observations from NOAA CO-OPS, processes them through a small Express service, and presents a React dashboard. The engineering goal is not merely to draw a line chart: it is to make it possible to trace a displayed value back through parsing, timestamp normalization, exclusion rules and the upstream source.

**Status:** Active portfolio application. The current data-integrity implementation is on [`feature/noaa-data-integrity`](https://github.com/DanielBarletta81/noaa-signals-lab/tree/feature/noaa-data-integrity) and [draft PR #2](https://github.com/DanielBarletta81/noaa-signals-lab/pull/2). The observation-first interface redesign described here is on this branch, in [draft PR #3](https://github.com/DanielBarletta81/noaa-signals-lab/pull/3), stacked on PR #2. The three knowledge environments are in [draft PR #4](https://github.com/DanielBarletta81/noaa-signals-lab/pull/4). Until these are merged, the default branch does **not** contain all improvements described below.

## What it currently does on the feature branch

- Reads hourly `water_temperature` observations for NOAA station **8454000** (Providence, Rhode Island).
- Accepts a 1–72 hour window, defaulting to 24 hours.
- Requests GMT timestamps and converts them to explicit UTC instants.
- Excludes missing, blank, malformed and non-finite measurements before calculating summaries; preserves genuine zero values.
- Reports row counts, exclusion reasons, original readings and NOAA-supplied flags; the flags are **preserved, not interpreted**.
- Displays latest accepted reading, timestamp, minimum, maximum, mean and a temperature chart.
- Distinguishes a valid empty row set from NOAA's ambiguous "no data" message.
- Uses neutral descriptive language instead of unsupported ecological-health classifications.
- Shows the latest accepted reading on an instrument plate, with an hour-by-hour coverage strip that marks each hour as observed, excluded, or with no row returned. *(Added in the redesign.)*
- Shows the status of any hour selected on the strip; excluded and missing hours never display a value. *(Added in the redesign.)*

## Why I built it

An earlier parsing path used `Number(value)`, which silently converted blank or `null` readings into `0`. A missing observation could therefore become a false 0°C event in a scientific chart. This project is an exercise in preventing that kind of failure and exposing the rules that determine which observations are suitable for plotting.

## Data flow

```text
NOAA CO-OPS data retrieval API
  -> Express route: validate station/product/window
  -> NOAA adapter: fetch, parse, normalize UTC, preserve provenance
  -> Observation filter: retain valid values, count exclusions
  -> Signal processor: accepted-only descriptive statistics
  -> API response: data, quality, status, source context
  -> React dashboard: observed values and clearly labeled limitations
```

### Scientific boundaries

- **Observed vs simulated:** normal application readings come from NOAA; test fixtures are stored separately and clearly labeled.
- **Missing is not zero:** invalid rows do not contribute to summaries.
- **No ecological diagnosis:** temperature alone does not establish whether a habitat is healthy, stressed or biologically safe.
- **No validated trend yet:** the previous last-step trend label was removed. A future time-aware slope must account for coverage and missingness.
- **NOAA flags:** retained but not yet decoded or used for filtering.
- **No-data ambiguity:** an upstream message may mean either no available observations or an unsupported station/product combination; the interface does not assert which without further evidence.

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

Server and client checks were re-run today on a clean export of this branch's tip (`b2335ba`), with Node 22.23.5. Browser and axe results are **recorded earlier** from the design-era build, which is the same application code. **None of these have been run by GitHub-hosted CI**, because the repository has no workflows.

| Check | Where it ran | Result |
|---|---|---|
| Server tests (`node --test`) | Local, clean export, re-run today | 137 pass, 0 fail |
| Client tests (`node --test`) | Local, clean export, re-run today | 71 pass, 0 fail |
| Client lint and production build | Local, clean export, re-run today | Pass |
| Browser keyboard, focus, reduced-motion, and target-size checks (Chrome 157, scripted) | Local, recorded earlier | 20 of 20 pass |
| axe-core (WCAG 2.x A and AA) on 21 captures (7 states × 3 widths) | Local, recorded earlier | 0 violations. The incomplete colour-contrast results were measured on the top of the stack, not on this branch. |
| GitHub-hosted CI | Not set up | Not run |
| Screen-reader testing (VoiceOver, NVDA) | Not done | Not run |
| Full WCAG conformance audit | Not done | No compliance claim is made |
| Continuous screen recording | Not done | The GIF is four keyboard-driven frames |

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

## Technologies

React, Vite, Recharts, Node.js, Express, NOAA CO-OPS API, Node's built-in test runner, Git.

## Requirements

- **Node.js 22.** The verified version is in `.nvmrc` (22.23.5). With nvm, run `nvm use` in the repository root. Node 23 works but prints `EBADENGINE` warnings from ESLint's own dependencies, and that output is not from this project's code.
- npm 11 was used for verification (11.8.0).

## Setup

Clone the repository and switch to this branch for review:

```bash
git clone https://github.com/DanielBarletta81/noaa-signals-lab.git
cd noaa-signals-lab
git switch feature/noaa-instrument-design   # this PR's branch; see Status for the stack
```

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

The Vite development proxy forwards relative `/api` requests to Express. A production deployment must separately configure routing or an API origin.

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

## Engineering choices and tradeoffs

| Decision                                                   | Rationale                                                            | Outstanding work                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| Express adapter instead of direct browser-to-NOAA requests | Centralizes input validation, normalization and error behavior       | Caching, rate limiting and production security policy |
| UTC internally                                             | Avoids ambiguous local timestamps around daylight-saving transitions | Add localized display with a clear timezone label     |
| Drop invalid readings but count them                       | Prevents fabricated observations while exposing data loss            | Decode NOAA quality flags and expand provenance       |
| Suppress misleading trends                                 | Avoids presenting an unvalidated calculation as evidence             | Test time-aware window slope and coverage thresholds  |
| Fixture-backed tests                                       | Deterministic assertions without depending on live NOAA uptime       | Browser tests and hosted CI                           |
| Presentation-only interface redesign *(added in this branch)* | The observation-first layout changes how values are shown, never which values are accepted | Screen-reader and cross-browser testing |

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

## Roadmap

1. Human review and merge of data-integrity PR.
2. Browser-level checks, accessibility verification and GitHub Actions.
3. NOAA flag interpretation, missingness visualization and observation coverage.
4. Defensible time-window trends and additional stations.

**Maintainer:** Daniel Barletta. AI-assisted implementation has been reviewed through local diffs and tests; further independent code and browser review is pending.
