# NOAA Signals Lab

**Observed coastal water temperature, presented with explicit data quality and scientific limitations.**

![Desktop view of the NOAA Signal Explorer: the latest measured water temperature (11.9 °C at 14 Nov 2026, 00:00 UTC) on an instrument plate, above a chart of 24 accepted hourly observations, a coverage strip with each hour's status, and context, quality, and method panels. Demonstration only: the values come from a captured NOAA response served by a local demonstration harness, not from a live request.](docs/media/demo-observation-desktop.png)

*Demonstration, not live data.* The image above is a captured NOAA response rendered through the real Express route and processing code. A live capture, with its retrieval time printed on the page, is in [`docs/media/live-observation-desktop.png`](docs/media/live-observation-desktop.png). The full media inventory is in [Showcase media](#showcase-media).

NOAA Signals Lab retrieves public observations from NOAA CO-OPS, processes them through a small Express service, and presents a React dashboard. The engineering goal is not merely to draw a line chart: it is to make it possible to trace a displayed value back through parsing, timestamp normalization, exclusion rules and the upstream source.

This project is the real-data sibling of Estuary Signal Lab.

**Status:** Active portfolio application. The current data-integrity implementation is on [`feature/noaa-data-integrity`](https://github.com/DanielBarletta81/noaa-signals-lab/tree/feature/noaa-data-integrity) and [draft PR #2](https://github.com/DanielBarletta81/noaa-signals-lab/pull/2). The interface redesign is stacked on it in [draft PR #3](https://github.com/DanielBarletta81/noaa-signals-lab/pull/3), and the three knowledge environments are stacked on that in [draft PR #4](https://github.com/DanielBarletta81/noaa-signals-lab/pull/4). Until these are merged, the default branch does **not** contain all improvements described below.

## What it currently does on the feature branch

- Reads hourly `water_temperature` observations for NOAA station **8454000** (Providence, Rhode Island).
- Accepts a 1–72 hour window, defaulting to 24 hours.
- Requests GMT timestamps and converts them to explicit UTC instants.
- Excludes missing, blank, malformed and non-finite measurements before calculating summaries; preserves genuine zero values.
- Reports row counts, exclusion reasons, original readings and NOAA-supplied flags; the flags are **preserved, not interpreted**.
- Displays latest accepted reading, timestamp, minimum, maximum, mean and a temperature chart.
- Shows the latest accepted reading on an instrument plate, with an hour-by-hour coverage strip that marks each hour as observed, excluded, or with no row returned. *(Added in the redesign.)*
- Shows the status of any hour selected on the strip. Excluded and missing hours never display a value. *(Added in the redesign.)*
- Distinguishes a valid empty row set from NOAA's ambiguous "no data" message.
- Uses neutral descriptive language instead of unsupported ecological-health classifications.

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

For field definitions, see [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) **on the feature branch**.

## How to read the page

The page moves the reader from measurement to observation to interpretation, in three environments:

1. **Instrument (measurement).** The latest accepted value on a registered plate, and the derived summary.
2. **Field note (observation).** A selected hour, shown as a note slip, and the contextual notes.
3. **Lab bench (interpretation).** Data quality and methodology.

The coverage strip uses one shape per hour, not colour alone:

| Shape on the strip | Meaning | What the page shows for it |
|---|---|---|
| Solid sea-glass block | NOAA returned a row, and it passed validation | Its measured value |
| Hatched block (clay) | NOAA returned a row, but it was excluded (for example, a blank value) | No value. It is never plotted or treated as zero. |
| Dashed outline | NOAA returned no row for that hour | No value. Nothing is estimated. |

The chart connects measured hours with straight segments, because a smooth curve would imply values between the measured hours. Error and empty states are described in their own panels. "NOAA reported no data" is deliberately not reported as "no observations," because NOAA's response does not say which of the two it means.

Texture is kept away from anything a reader must read or see. Ruled lines appear only in a 14 px header band, and the chart has no texture. No alarm colours or hazard styling are used.

### Accessibility

- The hourly strip is a set of buttons with one tab stop. Arrow keys move between hours, Home and End jump to the ends, and Enter selects an hour.
- Every hour has a full accessible name, such as "14 Nov 2026, 14:00 UTC: no row returned by NOAA."
- Focus is shown with a 3 px high-contrast outline. A skip link moves focus to the observation.
- Under `prefers-reduced-motion`, transitions, the entrance animation, and chart animation are turned off.
- Phone-width hour targets are at least 24 CSS px. The palette is checked against WCAG 2.x contrast in the test suite.
- A table of every hour, with its status and value, sits under the chart, so no information is available only as a picture.

These are scripted checks, not a compliance audit. See the verification table below.

## Verification status

Local checks were re-run on a clean export of the top of the stack, `feature/noaa-immersive-environments` at `69238aa`, with Node 22.23.5. Browser checks are scripted Chrome 157 runs. **None of these have been run by GitHub-hosted CI**, because the repository has no workflows.

| Check | Where it ran | Result |
|---|---|---|
| Server tests (`node --test`) | Local, clean export | 137 pass, 0 fail |
| Client tests (`node --test`) | Local, clean export | 91 pass, 0 fail |
| Client lint and production build | Local, clean export | Pass |
| Browser keyboard, focus, reduced-motion, and target-size checks (scripted) | Local, against the committed interface | 20 of 20 pass |
| axe-core (WCAG 2.x A and AA) on 21 captures (7 states × 3 widths) | Local, scripted | 0 violations. **21 colour-contrast results are incomplete**: axe could not decide them automatically (see note below). |
| GitHub-hosted CI | Not set up | Not run |
| Screen-reader testing (VoiceOver, NVDA) | Not done | Not run |
| Full WCAG conformance audit | Not done | No compliance claim is made |
| Continuous screen recording | Not done | The GIF is four keyboard-driven frames |

**About the 21 incomplete results.** axe reports one colour-contrast group as *incomplete* for each capture, and it can't decide those elements automatically. In the capture I inspected, that group covered 27 elements, and the ones sampled were SVG chart tick labels and the arrow glyphs in the journey line. Axe can't compute contrast for SVG text or for elements over gradients. The contrast ratios computed from the stylesheet's colour tokens are 7.24:1 to 16.71:1 for the colour pairs in use. Those are token-level calculations, not element-by-element measurements, so they are not a substitute for a manual check.

## Technologies

React, Vite, Recharts, Node.js, Express, NOAA CO-OPS API, Node's built-in test runner, Git.

## Run locally (feature branch)

Requires the Node 22 version documented in `.nvmrc` and npm.

```bash
git clone https://github.com/DanielBarletta81/noaa-signals-lab.git
cd noaa-signals-lab
git switch feature/noaa-immersive-environments   # top of the stack; after the stack is merged, use: git switch main
npm ci
(cd server && npm ci)
(cd client && npm ci)
npm run dev
```

Frontend: `http://localhost:5173` · API: `http://localhost:4200/api/health`

The Vite development proxy forwards relative `/api` requests to Express. A production deployment must separately configure routing or an API origin.

## Verify

```bash
(cd server && npm test)
(cd client && npm test && npm run lint && npm run build)
curl -i http://localhost:4200/api/health
curl -i 'http://localhost:4200/api/signals?station=8454000&product=water_temperature&range=24'
```

**Reported local verification on PR #2:** 132 server tests and 34 client tests passing, lint and clean build passing, and no server production advisories at the time tested. These are **local checks, not GitHub-hosted CI**. Browser/Playwright validation has not yet been performed.

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
| Presentation-only environments *(added in the redesign)*   | The three environments change how values are shown, never which values are accepted | Screen-reader and cross-browser testing |

## Showcase media

All files are in `docs/media/`. Fixture-backed images are demonstrations, not live NOAA data.

| File | What it shows | Source |
|---|---|---|
| `demo-observation-desktop.png` | Desktop observation state (hero image) | Fixture-backed demonstration |
| `demo-observation-mobile.png` | Phone-width observation state | Fixture-backed demonstration |
| `demo-excluded-and-missing-hours-desktop.png` | One blank value and one missing hour, from a modified capture | Demonstration (modified fixture) |
| `demo-selected-field-note-desktop.png` | A selected excluded hour, shown as a field note | Demonstration (modified fixture) |
| `demo-timeout-error-desktop.png` | Upstream timeout state | Demonstration (simulated timeout) |
| `demo-no-data-desktop.png` | NOAA no-data state, with its ambiguity stated | Demonstration (captured NOAA response) |
| `demo-keyboard-interaction.gif` | Four keyboard-driven frames: latest, excluded hour, missing hour, back to latest | Demonstration sequence, **not** a continuous recording |
| `live-observation-desktop.png` | Live NOAA data at capture time; the retrieval time is printed on the page | Live |
| `demo-before-redesign-desktop.png` | The interface before the redesign, for comparison | Demonstration (pre-redesign code) |

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
