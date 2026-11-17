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

Requires Node 22.23.5, the version in `.nvmrc`, and npm. This is the runtime used for the verification in the saved-snapshots section below.

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
| `PORT` | server environment | `4200` | Port for the Express server (1 to 65535). |
| `NOAA_TIMEOUT_MS` | server environment | `8000` | Time allowed for each NOAA request (1 to 60000) |
| `API_PROXY_TARGET` | shell, for `npm run dev` or `preview` in `client/` | `http://localhost:4200` | Where the Vite proxy forwards `/api` |
| `SNAPSHOT_DB_PATH` | server environment | `server/data/noaa-signals.sqlite` | Location of the saved-snapshot SQLite file. Use a writable path on persistent storage. Set by the operator only; the browser cannot choose it. |
| `SNAPSHOT_MAX_COUNT` | server environment | `500` | Most saved copies the shared archive holds (1 to 100000). A save beyond it is refused with 507. |
| `TRUST_PROXY_HOPS` | server environment | `0` | How many reverse proxies you run in front of this server (0 to 2). `0` ignores `X-Forwarded-For` entirely. Set `1` only when exactly one proxy you control appends to that header. |
| `CORS_ALLOWED_ORIGINS` | server environment | the local Vite origins (`http://localhost:5173`, `:4173`, and `127.0.0.1` equivalents) | Comma-separated browser origins allowed to read responses and to save. Each entry is an origin only (`https://host[:port]`, no path or slash). Plain `http` is accepted only for localhost. |
| `VITE_API_BASE_URL` | `client/.env.local`, at build time | empty (same origin) | API origin for a deployed build. Must be `https`, except `http://localhost`. See `client/.env.example`. |

**Startup validation.** Every value above that is set is checked when the server starts. A value that is not valid stops the server before it opens the database or listens on a port. The message lists every invalid setting at once, and the server exits with status 1. A value that is unset, or blank after trimming, uses the default shown. An invalid value is never replaced by a default.

`VITE_API_BASE_URL` is compiled into the public JavaScript bundle. Never put secrets in any `VITE_` variable. `CORS_ALLOWED_ORIGINS` is not a secret, and it is not authentication: any program can send any `Origin` header.

## Hosting and deployment settings

No deployment exists yet, and this repository does not name a hosting provider or a frontend URL. The settings above are therefore defaults for local development, and the values for a real deployment are an open decision. Before any deployment:

1. Set `CORS_ALLOWED_ORIGINS` to the exact origin the client is served from (for example `https://noaa.example.org`). If the client is served from the same origin as the API behind a path-based router, the list can stay at its default.
2. Build the client with `VITE_API_BASE_URL` set to the API's `https` origin, if the API is on another origin.
3. Set `TRUST_PROXY_HOPS=1` only when the API sits behind exactly one reverse proxy that you run. Leave it at `0` when the API is reached directly. If your proxy does not append its client address to `X-Forwarded-For`, the limits key on the proxy's address instead.
4. Put the API behind TLS. The app does not terminate TLS, and the browser build requires an `https` API origin unless it is localhost.

What the settings do and do not provide. They decide which browser pages may read responses, which address the per-connection limits count, and which browser origins may save. They do not identify a user, and they do not stop a program from calling the API. The limits and the origin check are speed bumps, not access control.

## Observation cache and request limits

`GET /api/signals` is cached for **5 minutes** per station, product, and window. The server asks NOAA at most once per key per 5 minutes, however many visitors load the page. Concurrent identical requests share one NOAA call.

Each response has a `cache` object:

| Field | Meaning |
|---|---|
| `status` | `miss`: this request asked NOAA. `hit`: served from the cache. `shared`: joined a NOAA request already in progress. |
| `fetchedAt` | When NOAA was asked (the same value as `source.retrievedAt`). Shown on the page as the retrieval time. |
| `storedAt`, `expiresAt` | When this cache entry was stored, and when it stops being used. Five minutes apart. |
| `maxAgeSeconds` | `300`. |

What the cache does not change: the observations, their acceptance rules, the units, and the time zone. A cached body is the same body a fresh request would return, apart from this `cache` object and the `retrievalId`. A cache entry is used only while its retrieval is still held by the save store, so a cached `retrievalId` can always be saved. Errors are never cached. A saved copy never records that it came from the cache.

Limits on `GET /api/signals`: 30 requests per minute per connection address, with `429 rate_limited` and `Retry-After` when exceeded. A cache hit counts against this limit. Every response is `Cache-Control: no-store`, so no browser or intermediary keeps a `retrievalId`.

Upstream bounds: a NOAA response is refused if it is over 256 KB (checked while it is read, and before it is read when `Content-Length` says so), or if it has more than 200 rows. Both are `502 upstream_error`.

## Dependency audit

Triaged on 2026-11-15 with `npm audit` (read-only) and `npm audit fix` without `--force`:

| Package | Scope | Severity | Reachable in production? | Outcome |
|---|---|---|---|---|
| Server production dependencies (`express`) | `dependencies` | none | — | `npm audit --omit=dev`: 0 |
| Client production dependencies (`react`, `react-dom`, `recharts`) | `dependencies` | none | — | `npm audit --omit=dev`: 0 |
| `vite`, `eslint`, `postcss`, `nanoid`, `source-map-js`, `browserslist`, `baseline-browser-mapping`, `zod`, `@babel/core`, `@eslint/config-array`, `minimatch`, `brace-expansion` (client tree) | build and lint tools | high and moderate, plus one low | No. These run during development and build, and are not shipped in `dist/`. The Vite advisories concern the dev server and Windows path handling. | Fixed by `npm audit fix` within the declared ranges. Client `npm audit`: 0. |
| `nodemon` and its `minimatch` (server tree) | development watcher (`npm run dev`) | moderate | No. `npm start` runs `node src/index.js` directly, and `nodemon` is not on the production path. | **Not fixed.** The only fix is `minimatch` 11.x, and `nodemon` 3.1.14 (the latest 3.x) pins `minimatch ^10`. Options: an `overrides` entry (untested with nodemon), or replacing nodemon with `node --watch`. Both change dependencies, so this needs your decision. |
| Root `package.json` (the committed version listed `express`, `react`, and others, which nothing at the root runs) | root tooling only | critical (in the root lock's `concurrently` chain), plus high and moderate in the root packages | No. The server and client run their own dependencies. The root `dev` script needs only `concurrently`. | **Fixed** in its own commit. The maintainer's working-tree change, which removes the root `dependencies` block, is applied unchanged, and the root lock was regenerated from it (186 packages removed, `concurrently` kept). `npm audit fix` without `--force` then moved `shell-quote` to 1.12.0, inside `concurrently`'s `^1.8.1` range. Root audit: 0. `npm ci` at the root passes, and `concurrently` runs. |

The client's `npm audit fix` changed 45 packages and added 10 and removed 1, all within the declared caret ranges, and the tests, lint, and build still pass.

## API

`GET /api/signals?station=8454000&product=water_temperature&range=24`

| Status | Meaning |
|---|---|
| 200 `status: "ok"` | At least one observation was accepted |
| 200 `status: "empty"` | NOAA returned a valid response with no rows. `absenceStatus` is `rows_absent_in_window`. |
| 200 `status: "empty"`, `emptyReason: "noaa_no_data_message"` | NOAA returned its no-data text. This does not prove the window was empty. `absenceStatus` is `not_established`. |
| 200 `status: "no_valid_observations"` | Rows were returned, but all were excluded |
| 400 `invalid_parameter` | A station, product, or range is not on the allowlist (only `8454000`, `water_temperature`, 1 to 72 hours) |
| 502 `upstream_error` / `upstream_unreachable` | NOAA failed or could not be reached, or NOAA's response was over 256 KB or had more than 200 rows |
| 504 `upstream_timeout` | NOAA did not respond in time |
| 429 `rate_limited` | More than 30 requests per minute from one connection address. `Retry-After` gives the wait. A cache hit counts. |

Every 200 response carries a `cache` object (see "Observation cache" below). Responses are `Cache-Control: no-store`.

Saved snapshots (see below):

| Method and path | Meaning |
|---|---|
| `POST /api/snapshots` with `{"retrievalId": "..."}` | Save the response the server still holds under that ID. 201 `created: true` with the new snapshot. 200 `created: false` with the copy already made, when the same retrieval is saved again. 404 `retrieval_not_found` once the retrieval has expired, been evicted, or the server has restarted. 403 `origin_not_allowed` when a browser page on a site not in `CORS_ALLOWED_ORIGINS` tries to save. 413 `snapshot_too_large` when the copy has more than 200 rows or more than 64 KB of stored text. 507 `archive_full` when the archive holds its maximum. 429 `rate_limited` with `Retry-After` when one address saves too often (10 per minute). 503 `storage_unavailable` when the database fails; nothing is saved. |
| `GET /api/snapshots?limit=10&offset=0` | List saved snapshots, newest first. `limit` 1 to 50, `offset` 0 to 100000. Anyone who can reach the server can read the list. |
| `GET /api/snapshots/:id` | One snapshot and its rebuilt signal body. 404 `snapshot_not_found` for an unknown ID. |

`GET /api/signals` returns `quality.accepted`, which lists each accepted row in NOAA's order with its raw `t` text, raw `v` value, and `q`/`f` flags. Together with `quality.excluded`, it accounts for every row NOAA returned. A saved copy returns the same lists.

## Saved snapshots

A saved snapshot is a copy of one loaded NOAA response, kept in a local SQLite database on the server. Saving happens only when you press **Save these observations**. Opening a saved copy reads the database. It never contacts NOAA, and the page labels it as a saved copy with its original retrieval time and its save time. Saved copies do not update.

**What a copy keeps.** Every row NOAA returned: the accepted values as both the raw text and the parsed number, the NOAA `t` text, the excluded rows with their reasons and raw text, and the `q` and `f` flags on every row. The row's original position in NOAA's response is kept for every row. Nothing is filled in, and no missing hour gets a value. Units (°C) and time-zone metadata (GMT) are stored with each copy. The save and reopen checks in `server/test/snapshots.fidelity.test.js` compare these fields after the database is closed and reopened.

**Who can see and change saved copies: everyone.** The archive is shared. There are no accounts, no owners, and no private copies. Anyone who can reach the server can list copies, open them, and add new ones. Copies cannot be deleted through the app. The data is public NOAA data, but the archive is still shared, and the page says so. Do not describe it as private storage.

**Snapshot IDs are sequential and public.** Each copy has a number (1, 2, 3, …). Anyone who knows a number can open that copy, and the list shows every copy. This is by design for a shared archive, and it is not a security boundary.

**Retrieval IDs are not authorization.** A retrieval ID is a random version-4 UUID given to the browser after a successful load. It identifies the server's in-memory copy of that load, so the save can copy what NOAA returned. It is a bearer string: whoever holds it can save that one retrieval. It does not identify a user, and it grants no right to read or change any other copy. Retrieval IDs are never stored in the database and never appear in the list or in a copy.

**Retrieval retention.** The server holds each successful load in memory, up to 20 loads, for 30 minutes. Three things end that hold, and each gives the same answer, 404 `retrieval_not_found`, so the page can offer **Load observations again**:
1. **Expiry:** 30 minutes after the load.
2. **Capacity:** the store holds 20 loads for all visitors together. When it is full, the oldest is dropped. On a busy server, a load can be dropped within minutes of being made.
3. **Restart:** the store is in memory. Any restart empties it. Saved copies in SQLite are not affected.

**Bounds on writes and storage.** These limits protect the archive. Each one is a bound on one kind of growth, and none of them is an access control.
- **Capacity:** `SNAPSHOT_MAX_COUNT` (default 500 copies). When the archive is full, a save is refused with 507 and the message says that nothing was saved. Existing copies are never deleted to make room.
- **Size of one copy:** at most 200 rows (the same bound NOAA responses are held to) and at most 64 KB of stored text. A save over either bound is refused with 413, and nothing is written. The request body is at most 1 KB.
- **Saves per address:** 10 save attempts per minute per connection address, with `Retry-After` on refusal. A save refused for its origin does not count toward this limit.
- **Repeated saves:** saving the same retrieval again returns the copy already made, so repeated clicks do not create duplicates.

**Storage is measured, not guaranteed.** Measured on Node 22.23.5 with this repository's code: a typical 24-hour copy takes about 4 KB on disk, so 500 such copies take about 2 MB. The largest copy the save path accepts (200 rows, raw text at the 64 KB bound) takes about 74 KB on disk, so 500 of those would take about 37 MB. A deployment that expects large copies should size `SNAPSHOT_MAX_COUNT` against the disk it has. The app does not enforce a total byte budget.

**Proxy and address handling.** The per-address limits count the connection's address. With `TRUST_PROXY_HOPS=0` (the default) that is the address the TCP connection came from, and `X-Forwarded-For` is ignored. With `TRUST_PROXY_HOPS=1`, the address is the one your single proxy appended. Tests in `server/test/proxy.trust.test.js` send real forwarded headers to check both rules. Under the default, a client that rotates `X-Forwarded-For` does not escape the limit.

**Origins.** A save from a browser page whose `Origin` is not in `CORS_ALLOWED_ORIGINS` is refused with 403, and a page on another site cannot read responses. A program can still send any `Origin` header, so this is not authentication.

These limits do not stop someone who is determined to fill the archive. They bound how fast one address can add copies and how large the archive can grow. Loads are limited and cached as described in "Observation cache and request limits".

- When saving, the browser sends only a retrieval ID. It cannot send observation data, a file name, or a path.
- Demonstration copies come from a captured NOAA fixture, not from a live request. They are labelled "Demonstration" in the list and in the banner. Create one with `(cd server && npm run snapshots:seed-demo)`. Running it again reports that the snapshot already exists.

**Storage.** The default file is `server/data/noaa-signals.sqlite`, with `-wal` and `-shm` companions while the server runs. Set `SNAPSHOT_DB_PATH` to put it elsewhere. The directory is created when missing. Git ignores these files, and they hold no credentials.

**Persistence limits.** SQLite needs a writable disk that survives restarts. That is fine for local use. Ephemeral hosts (containers, or platforms that reset the filesystem on deploy or restart) lose saved copies, so do not describe this as production persistence on such a host. There is no backup and no support for several servers sharing one file.

**Restart behaviour.** A completed save survives a clean stop and a crash. The server test `snapshots.restart.test.js` saves over HTTP, kills the process with SIGKILL, starts it again on the same file, and reopens the copy. A save that is still in progress when the process stops is not committed, and SQLite discards an uncommitted transaction when it next opens the file. That is SQLite's guarantee. It was not separately tested by killing a process in the middle of a save. Old retrieval IDs do not survive a restart. Load the observations again before saving.

**Runtime.** The server uses Node's built-in `node:sqlite`, which is experimental in this Node line, so startup prints an `ExperimentalWarning`. The schema is versioned. Migrations run in a transaction at startup, and the server refuses a database written by a newer version.

**Verification of this feature.** The checks below were run on Node 22.23.5, the version in `.nvmrc`, with `npm ci` in the `server` and `client` directories, on 2026-11-15 against branch `feature/noaa-saved-snapshots-hardening`.

| Check | Result on Node 22.23.5 |
|---|---|
| Server tests (`npm test`) | 284 pass, 0 fail. 172 from the original commit, 44 from the first hardening commit, 49 from the cache and limits round, and 19 from the integration (startup configuration and save-readback tests). The script runs `test/*.test.js` only. |
| Client tests (`npm test`) | 128 pass, 0 fail |
| Client lint and production build | Lint clean. Build succeeds, with Vite's chunk-size warning for the 620 kB bundle. |
| `npm audit --omit=dev`, server and client | 0 advisories in production dependencies. See "Dependency audit" for the development-only items. |
| Live NOAA load, save, repeat save, reopen, restart (see the browser run below) | 32 of 32 checks passed, on the development build and on the production bundle |
| Eviction (see the browser run below) | 3 of 3 checks passed, on the development build and on the production bundle |
| Restart with SIGKILL after a save (server test) | Copy present after restart. Old retrieval gives 404. |

**Browser run, 2026-11-15, this session.** A browser run of the interface as it is on this branch. It is separate from the earlier scripted Chrome run, which predates these changes and is not repeated here.
- Environment: Google Chrome 157.0.8103.52 on macOS, driven by `playwright-core` 1.65.1 from outside the repository. The API ran on Node 22.23.5. Each phase ran twice: once against the Vite development server, and once against the production bundle served by `vite preview`.
- Live phase: real NOAA data for Providence (8454000), through the API. It covered a first load, saving by keyboard (Enter), focus on the confirmation, the archive list, a repeat save after a reload (a cache hit), reopening (no NOAA request, focus on the banner), "Return to current session" (no NOAA request), an API restart that expired the page's retrieval (404, the recovery action, then a successful save), a copy surviving the restart, and a 390 px mobile layout.
- Eviction phase: a second API that preloads the captured NOAA fixture, so that 20 extra loads cost no NOAA traffic. The page's retrieval was evicted and the save returned 404 with the recovery action. The fixture was used only to force eviction, and this phase proves nothing about live data.
- Screenshots and results are kept outside the repository, in `/private/tmp/noaa-browser/` (`shots-dev-build/`, `shots-prod-build/`, and the `results-*.json` and `*-run-*.log` files).
- Not covered by the browser run: screen-reader output, reduced-motion behaviour, and any real foreign origin (origin rules are covered by HTTP tests). The eviction phase used the captured fixture, so it proves the page's behaviour, not live data. Automated checks do not establish WCAG conformance.

## Engineering choices and tradeoffs

| Decision                                                   | Rationale                                                            | Outstanding work                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| Express adapter instead of direct browser-to-NOAA requests | Centralizes input validation, normalization and error behavior       | Production hosting, proxy topology, and the deployed frontend origin |
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
