// Static checks on the client source. They guard against the hard-coded localhost
// URL and the missing dev proxy coming back. They read files, so they do not prove
// runtime behaviour.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("client configuration", () => {
  it("the React hook no longer hard-codes localhost:4200", () => {
    assert.equal(read("../src/hooks/useNoaaSignal.js").includes("localhost:4200"), false);
  });

  it("no client source file hard-codes localhost:4200 outside the dev-proxy default", () => {
    const sources = [
      "../src/api/signalApi.js",
      "../src/hooks/useNoaaSignal.js",
      "../src/App.jsx",
    ];
    for (const path of sources) {
      assert.equal(read(path).includes("localhost:4200"), false, path);
    }
  });

  it("the hook reads the API base only from VITE_API_BASE_URL", () => {
    assert.match(read("../src/hooks/useNoaaSignal.js"), /import\.meta\.env\.VITE_API_BASE_URL/);
  });

  it("the Vite config proxies /api in both dev and preview", () => {
    const config = read("../vite.config.js");
    assert.match(config, /server:\s*\{\s*proxy: apiProxy/);
    assert.match(config, /preview:\s*\{\s*proxy: apiProxy/);
    assert.match(config, /'\/api'/);
  });

  it("documents the production base URL in .env.example, with the active default empty", () => {
    const activeLines = read("../.env.example")
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
    assert.deepEqual(
      activeLines.filter((line) => line.startsWith("VITE_API_BASE_URL")),
      ["VITE_API_BASE_URL="],
      "the only active VITE_API_BASE_URL assignment has an empty value"
    );
  });
});
