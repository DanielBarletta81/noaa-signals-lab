// The seed script runs only when it is the entry point, so importing it in tests does not
// write to a database. The check must work for paths that need URL encoding.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { isEntryPoint } from "../scripts/seed-demo-snapshot.js";

describe("seed script entry-point detection", () => {
  it("recognises the script when its path contains a space", () => {
    const script = "/tmp/My Projects/noaa server/scripts/seed-demo-snapshot.js";
    assert.equal(isEntryPoint(pathToFileURL(script).href, script), true);
  });

  it("recognises a script whose path contains other characters that need encoding", () => {
    const script = "/tmp/Café #1/seed-demo-snapshot.js";
    assert.equal(isEntryPoint(pathToFileURL(script).href, script), true);
  });

  it("does not run when imported by another module", () => {
    const moduleUrl = pathToFileURL("/tmp/app/scripts/seed-demo-snapshot.js").href;
    assert.equal(isEntryPoint(moduleUrl, "/tmp/app/src/index.js"), false);
  });

  it("does not run when no script path was given", () => {
    const moduleUrl = pathToFileURL("/tmp/app/scripts/seed-demo-snapshot.js").href;
    assert.equal(isEntryPoint(moduleUrl, undefined), false);
    assert.equal(isEntryPoint(moduleUrl, ""), false);
  });
});
