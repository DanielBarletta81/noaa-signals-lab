// Test-only preload for a spawned server. It answers NOAA-bound requests from the captured
// fixture, so a real server process can save a live retrieval without network access.
// Loaded with `node --import`. Never loaded by the application itself.

import { readFileSync } from "node:fs";
import { NOAA_DATAGETTER_URL } from "../../src/adapters/noaaClient.js";

const fixtureText = readFileSync(
  new URL("../fixtures/noaa-8454000-water_temperature-gmt-24h.json", import.meta.url),
  "utf8"
);
const realFetch = globalThis.fetch;

globalThis.fetch = async (url, options) => {
  if (String(url).startsWith(NOAA_DATAGETTER_URL)) {
    return new Response(fixtureText, { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return realFetch(url, options);
};
