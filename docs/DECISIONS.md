# Decisions

Short, dated records of decisions that shape what the interface shows and how it can be verified. Newest first.

## 2026-11-15: Integration of the parallel review, and strict startup configuration

**Decision.** `feature/noaa-saved-snapshots-hardening` (`e316be2`) is the integration candidate. A second review of the same snapshot code, on `feature/noaa-saved-snapshots-review` (`f7a8e09`), was compared line by line. Only its unique, non-conflicting changes were carried over. Its competing contract was not merged. Every explicitly supplied operator setting now fails startup when invalid, and an unset or blank setting uses its documented default.

**Public contract, kept as published:** `SNAPSHOT_MAX_COUNT` (default 500); `507 archive_full` when full; a repeat save returns `created: false`; 10 saves per minute per connection address.

**Taken from the parallel review:**
- The root test script runs `test/*.test.js` only, so helper modules are not run as tests.
- A reopened copy reports the time zone and interval stored with it, not constants (`source.timeZone` and `source.interval`).
- A clearer 404 message for an expired or lost retrieval: it may have expired, or the server may have restarted.
- Tests for an injected failure while reading the saved copy back: the whole save rolls back, and the same connection then saves normally.

**Not taken, and why:**
- `SNAPSHOT_MAX_TOTAL`, and the `snapshot_store_full` error code. They rename the published contract.
- `alreadySaved` in the save response. The published field is `created`, so a repeat save returns `created: false`.
- A save limit of 10 per 10 minutes. The published limit is 10 per minute.
- A storage ceiling of 10,000 copies. The published maximum is `SNAPSHOT_MAX_COUNT` up to 100,000, with 500 as the default.
- The capacity field in the list response and the "3 of 500" panel line. Useful, but a new feature. Left as an optional improvement.
- The restart helper script. This branch already has an equivalent SIGKILL restart test.

**Startup configuration.** Each setting is read by `server/src/config/env.js` before the database is opened or a port is bound. Invalid values for `PORT`, `SNAPSHOT_MAX_COUNT`, `NOAA_TIMEOUT_MS`, `TRUST_PROXY_HOPS`, and `CORS_ALLOWED_ORIGINS` stop the server with exit status 1. All problems are reported in one message. A value that is unset or blank uses its documented default. The earlier silent fallbacks for `SNAPSHOT_MAX_COUNT` and `NOAA_TIMEOUT_MS` were removed. A test starts the real process with two invalid values and checks the exit code, the messages, and that no database is created.

**Consequences.** Blank values count as unset, so a deployment template with empty entries still starts. That is a deliberate choice, and it is stated in the README.

## 2026-11-15: Hosting settings, observation cache, request limits, and dependency triage

**Decision.** The API caches each NOAA observation window for 5 minutes and coalesces identical concurrent requests. It limits `GET /api/signals` to 30 requests per minute per connection address. Browser origins come from `CORS_ALLOWED_ORIGINS` (local development by default), and writes from other origins are refused. `TRUST_PROXY_HOPS` (default 0) controls whether `X-Forwarded-For` is read, and only for a proxy the operator runs. Invalid values for these settings stop the server at startup. Dependency fixes are applied only within declared ranges, without `--force`.

**Why.**
- NOAA publishes hourly values, and each page load asked NOAA for the same window. The cache reduces that to one NOAA call per window per 5 minutes, whatever the number of visitors, and it bounds the upstream calls to the number of windows an allowlisted request can name (72).
- The cache stores only successful, normalized responses. It changes delivery, not observation. A cached body keeps the original `source.retrievedAt`, and the response says when the entry was stored and when it expires. Cache metadata is not saved in a copy, because it describes how a response was delivered, not what NOAA reported.
- A cached entry is used only while its retrieval is still held, so the `retrievalId` in a response is always saveable. This avoids handing out an ID the save store has already dropped.
- `X-Forwarded-For` is trusted only as far as the operator says there is a proxy. Trusting it by default would let any client choose the address that limits are keyed on. No deployment topology is defined in this repository, so the default is the only value supported by evidence.
- CORS restricts which pages may read responses. The write check refuses saves from browser pages on other sites. Neither is authentication, and the README says so.
- Audit fixes are applied only where they stay within a declared range. The one remaining server advisory is a development-only watcher whose fix needs a dependency decision, which is not made here.

**Consequences.**
- Visitors can see the same cached response, with the same `retrievalId`. A save from one visitor makes a later save of that ID return the existing copy (`created: false`). The copy is identical, so this is intended.
- Per-address limits count the TCP connection's address unless exactly one proxy is trusted. Behind a load balancer with several proxies, all traffic shares limits. The app does not support that topology.
- NOAA errors are not cached. A failing NOAA is retried on every request, bounded by the per-address limit.
- A deployment must set `CORS_ALLOWED_ORIGINS` to its frontend origin. No such origin is decided in this repository.
- `cors` was removed from the server, since the origin policy is now in `server/src/http/cors.js` and tested there. This is a removal, not an upgrade.

**Bounds on individual saves and NOAA responses.** A NOAA response is refused above 256 KB or 200 rows. A save is refused above 200 rows, above 64 KB of stored text, or above a 1 KB request body. The 500-copy default is a measured example, not a storage ceiling. A typical 24-hour copy is about 4 KB on disk, and the largest accepted copy is about 74 KB, so the archive's maximum size is set by the operator's choice of `SNAPSHOT_MAX_COUNT` and the disk they have.

**Dependency triage.** Production dependencies of the server and the client have no advisories. Development tools had 12 in the client and 3 in the server, which `npm audit fix` brought to 0 in the client and to 2 in the server. The server's remaining two are a development watcher (`nodemon`) and its `minimatch`, with a fix that needs `minimatch` 11, which `nodemon` 3.x does not allow. The root `package.json` on this branch had advisories, but nothing the server or client runs uses it. The maintainer's working-tree cleanup, which removes its unused `dependencies`, is applied in its own commit, with the root lock regenerated and the audit fix applied within range. Root audit is 0.

**Browser run.** Recorded in the README, "Verification of this feature". It used the Vite development build and real NOAA data for the live phase, and a captured fixture only to force eviction.

## 2026-11-15: Saved snapshots are a shared archive, bounded and labelled

**Decision.** Saved copies are shared by everyone who uses the server. There are no accounts, owners, or private copies, and copies cannot be deleted through the app. The archive has a capacity (`SNAPSHOT_MAX_COUNT`, default 500). Saves are limited per client address (10 per minute). A second save of the same retrieval returns the copy already made. The README, "Saved snapshots", states what these bounds do and do not promise.

**Why.**
- A save with no bound lets any client grow the database without limit. Each save is a write, so an unbounded archive is a storage problem on a public server.
- Repeated saves of one retrieval (double clicks, retries, another tab) would create duplicates that look like separate observations. The retrieval record remembers which copy it became, so the second save returns that copy instead.
- When the archive is full, the server refuses new saves and removes nothing. Deleting copies to make room would remove other people's saved work without their consent.
- Retrieval IDs are random version-4 UUIDs. They make a retrieval hard to guess, but they are a bearer string, not authorization, and this design does not rely on them for access control. Snapshot IDs are sequential and readable by anyone, which is the intended behaviour of a shared list.

**Consequences.**
- The archive is public to anyone who can reach the server. The page says so. The data is public NOAA data, but this is not private storage.
- A full archive refuses saves until an operator raises the limit or removes copies by hand. The app has no delete path.
- Per-address limits count the connection address, and no proxy is trusted by default. This was superseded by the 2026-11-15 hosting entry above, which adds `TRUST_PROXY_HOPS`.
- Loading observations (`GET /api/signals`) was not limited per address in this entry. That was superseded by the 2026-11-15 hosting entry, which adds a 30-per-minute limit and a 5-minute cache.

**Retrieval retention.** A retrieval is kept in memory for 30 minutes, up to 20 loads in total for all visitors. It is dropped at expiry, when newer loads push it out, and at any restart. All three give 404 `retrieval_not_found`. The page then offers **Load observations again** and hides the Save button, because saving the same retrieval again cannot succeed.

**Contract change.** `GET /api/signals` and saved copies now include `quality.accepted`: each accepted row in NOAA's order with its raw `t`, raw `v`, and `q`/`f` flags. It mirrors `quality.excluded`. Before this, the database held these fields but the API did not return them, while the quality panel said flags were kept with each reading. The acceptance rules did not change.

**Naming.** The control that returns from a saved copy to the page's current session is labelled "Return to current session". It does not fetch new observations. "Return to live observations" implied a new request, which it does not make.

## 2026-11-15: Saved observation snapshots (local SQLite, explicit save)

**Decision.** A visitor saves the NOAA response on screen with an explicit button. The server keeps each loaded response under a random retrieval ID for 30 minutes. Saving stores the server's copy, so the browser cannot submit observation data. Snapshots are kept in SQLite through Node's built-in `node:sqlite`.

**Why.**
- The browser cannot forge a saved observation. It sends a retrieval ID, and the server saves what it fetched from NOAA.
- Reopening rebuilds the same signal body through the same builder as a live response, so the chart, coverage, and quality panels behave the same way.
- `node:sqlite` needs no native build step and no new dependency. `better-sqlite3` is a common alternative, but it adds a native dependency that needs approval first.

**Consequences.**
- `node:sqlite` is experimental on this Node line, so startup prints an `ExperimentalWarning`. Revisit when it is stable, or if a native dependency is approved.
- Saving depends on the retrieval still being held. After a restart, or after 30 minutes, the user loads the observations again.
- Demonstration copies are labelled in the stored data and in the interface, so they cannot be read as current NOAA data.
- Node 22.23.5 (`.nvmrc`) was not installed on the machine used for the first commit of this feature, so that run used Node 23.7.0. It has since been re-run on 22.23.5; see the 2026-11-15 entry above.

**Contract change in the same entry.** Excluded rows now carry their row position and their `q`/`f` flags, and duplicate-timestamp exclusions report a real position instead of `null`. See `docs/DATA_DICTIONARY.md`. The acceptance rules did not change.

## 2026-11-14: Three knowledge environments (instrument, field note, lab bench)

**Status:** implemented on `feature/noaa-immersive-environments`. Not yet merged.

**Intent.** The journey from measurement to observation to interpretation should be visible in the interface, and it should not be decorative. A marine scientist should find it credible, a student should be able to follow it, and a visitor should be drawn in.

**Decisions.**
- Three environments, each with one surface treatment. *Instrument* is near-black ink with hairline plates for measured values. *Field note* is a warmer slate slip with a clipped corner, a ruled header band, and a faint wipe. *Lab bench* is a cooler surface with hairline grids and numbered steps.
- The environment is named on the page: the masthead carries the journey line, and each panel's kicker names its environment.
- A selected hour becomes a field-note slip, and the latest value stays on the instrument plate. The reader moves from the instrument reading to a specific observation.
- Texture is confined to places where it cannot compete with information. Ruled lines appear only in a 14 px band above the text. The wipe is a corner smudge kept inside its panel. The chart has no texture.
- Motion is one short settle when a note appears, plus a fix found during testing: the chart line animates only on its first render, so selecting an hour no longer makes the series vanish briefly.

**Rejected alternatives.**
- Paper texture behind body text. It lowers contrast for the readers who most need the text.
- Hazard or "field alert" styling for excluded rows or errors. It would imply ecological danger that the data does not show.
- Hand-lettered or script type. It reduces legibility and does not carry scientific meaning.
- Animated ripples or water effects. They are decoration, and they add motion without information.

**Verification.** 91 client tests (contrast of new text colours, texture placement, no alarm colours, each environment applied, animation regression), lint, and production build. Browser: 20 keyboard and responsive checks, and axe-core with zero violations across 21 captures. A defect found during browser testing was fixed: a wide clip-path wipe widened the page at 768 px.

## 2026-11-14: "Observatory Ledger" visual direction

**Status:** implemented on `feature/noaa-instrument-design`. Not yet merged.

**Problem.** The earlier interface gave every number equal weight, let labels collide with values, drew the chart from zero so the variation disappeared, and displayed the same caveat twice. It did not separate what was measured from what was derived, or what was excluded from what was missing.

**Chosen direction.** A deep ocean-ink background with warm off-white numerals for measured values, a serif display face for headings and numerals, a monospace face for timestamps and evidence, and one sea-glass accent for accepted observations. Each section works like a museum label, and the page reveals detail in a fixed order: observation, context, data quality, methodology.

**Why it serves interpretation.** The temperature series and its latest value are the largest elements, so the measurement leads. Every visual state has a second cue (a shape or a text label), so colour is not the only carrier of meaning. There are no gradients or blur, so nothing decorative competes with the data.

**Alternatives considered and rejected.**
- *Field Chart* (light paper, cartographic grid). Good for print, but fine grid lines compete with the series, and gaps would read as background texture rather than as missing data.
- *Instrument Gauges* (dials with coloured zones). Rejected because zones imply thresholds and health judgments. The project does not have a cited threshold, and inventing one would break the rule against unsourced interpretation.

### Visual vocabulary (one meaning per signal)

| Signal | Meaning | Non-colour cue |
|---|---|---|
| Sea-glass line and solid block | An accepted, measured observation | Solid fill |
| Off-white numerals | A measured value shown as the readout | Largest type on the page |
| Clay hatching | A row NOAA returned that was excluded; no value shown | Diagonal hatch and "row excluded" text |
| Dashed outline | No row returned for that hour; nothing estimated | Dashed outline and "no row returned" text |
| Clay left rule and label | A failed request | "Could not load observations" label |
| Dashed panel border | A valid response with no plottable data | Dashed border and explicit "does not claim" wording |
| Off-white focus ring | Keyboard focus | 3 px outline |

Clay is never an alarm colour. It marks rows that were excluded and failures that need attention, and every use is labelled in text.

### Scientific choices that the design makes visible

- **Straight segments, not a smooth curve.** A monotone spline draws shapes between measured hours. Those shapes suggest values that were never observed, so the chart joins only the measured points.
- **Y axis fitted to the data, labelled in °C.** A zero baseline hid the variation. The axis is fitted to the observed range and labelled, so it is not misleading.
- **Window alignment is inferred.** The coverage strip assumes NOAA returns the requested number of hours ending at the newest row. The page states this assumption in the caption, the method, and the table caption. It is not verified against a NOAA specification.
- **Derived numbers are labelled as derived.** Mean, minimum, and maximum come from accepted observations only, and the panel says so.
- **No trend, threshold, or health statement.** The method panel lists what is not calculated.

## 2026-11-14: Verification scope for this redesign

**Status:** accepted. Reported as part of the pull-request description.

- Automated: 137 server tests, 71 client tests, lint, and production build.
- Browser, scripted in Chrome 157 with Playwright: keyboard path, roving focus, focus visibility, reduced-motion emulation, and phone-width hour targets (20 checks). axe-core (WCAG 2.x A and AA) on 21 captures, with zero violations.
- **Not done:** screen-reader testing (VoiceOver, NVDA), a full WCAG conformance audit, and a continuous screen recording. The interface makes no compliance claim.
- Browser scripts and demonstration harness are kept outside the repository. Adding Playwright as a repository dependency needs approval, so these checks are not yet part of CI.

## 2026-11-14: Small API changes made for presentation

- `stationName` now falls back to the verified allowlist name (`Providence` for 8454000) when NOAA's response has no name, so no-data states still name the station. This does not change any processing.
- The timeout message reports sub-second limits in milliseconds. Whole-second rounding had shown "0 seconds" for a 400 ms limit.

No scientific processing logic changed. The accepted, excluded, and missing counts are unchanged.

## 2026-11-13: Earlier decisions

See `docs/DATA_DICTIONARY.md` for the data policies (timestamps, exclusions, no-data classification, quality flags, and interpretation policy) that this interface follows.
