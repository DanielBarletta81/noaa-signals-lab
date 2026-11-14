```text
NOAA Signals Lab
```

**Observed coastal water temperature, presented with explicit data quality and scientific limitations.**

NOAA Signals Lab retrieves public observations from NOAA CO-OPS, processes them through a small Express service, and presents a React dashboard. The engineering goal is not merely to draw a line chart: it is to make it possible to trace a displayed value back through parsing, timestamp normalization, exclusion rules and the upstream source.

**Status:** Active portfolio application. The current data-integrity implementation is on [`feature/noaa-data-integrity`](https://github.com/DanielBarletta81/noaa-signals-lab/tree/feature/noaa-data-integrity) and [draft PR #2](https://github.com/DanielBarletta81/noaa-signals-lab/pull/2). Until merged, the default branch does **not** contain all improvements described below.

## What it currently does on the feature branch

- Reads hourly `water_temperature` observations for NOAA station **8454000** (Providence, Rhode Island).
- Accepts a 1–72 hour window, defaulting to 24 hours.
- Requests GMT timestamps and converts them to explicit UTC instants.
- Excludes missing, blank, malformed and non-finite measurements before calculating summaries; preserves genuine zero values.
- Reports row counts, exclusion reasons, original readings and NOAA-supplied flags; the flags are **preserved, not interpreted**.
- Displays latest accepted reading, timestamp, minimum, maximum, mean and a temperature chart.
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

## Technologies

React, Vite, Recharts, Node.js, Express, NOAA CO-OPS API, Node's built-in test runner, Git.

## Run locally (feature branch)

Requires the Node 22 version documented in `.nvmrc` and npm.

```bash
git clone https://github.com/DanielBarletta81/noaa-signals-lab.git
cd noaa-signals-lab
git switch feature/noaa-data-integrity
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
```

**Reported local verification on PR #2:** 132 server tests and 34 client tests passing, lint and clean build passing, and no server production advisories at the time tested. These are **local checks, not GitHub-hosted CI**. Browser/Playwright validation has not yet been performed.

## Engineering choices and tradeoffs

| Decision                                                   | Rationale                                                            | Outstanding work                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| Express adapter instead of direct browser-to-NOAA requests | Centralizes input validation, normalization and error behavior       | Caching, rate limiting and production security policy |
| UTC internally                                             | Avoids ambiguous local timestamps around daylight-saving transitions | Add localized display with a clear timezone label     |
| Drop invalid readings but count them                       | Prevents fabricated observations while exposing data loss            | Decode NOAA quality flags and expand provenance       |
| Suppress misleading trends                                 | Avoids presenting an unvalidated calculation as evidence             | Test time-aware window slope and coverage thresholds  |
| Fixture-backed tests                                       | Deterministic assertions without depending on live NOAA uptime       | Browser tests and hosted CI                           |

## Roadmap

1. Human review and merge of data-integrity PR.
2. Browser-level checks, accessibility verification and GitHub Actions.
3. NOAA flag interpretation, missingness visualization and observation coverage.
4. Defensible time-window trends and additional stations.

**Maintainer:** Daniel Barletta. AI-assisted implementation has been reviewed through local diffs and tests; further independent code and browser review is pending.
