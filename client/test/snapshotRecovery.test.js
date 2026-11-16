// Snapshot recovery and labelling. The save-failure action, the shared-archive note, and
// the renamed return control are checked here. "Return to current session" replaces
// "Return to live observations" because that control does not fetch new observations.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { ARCHIVE_NOTE, saveFailureAction } from "../src/view/snapshots.js";

const srcRoot = new URL("../src/", import.meta.url);

function sourceFiles(dir = srcRoot, found = []) {
  for (const name of readdirSync(dir)) {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) {
      sourceFiles(new URL(`${name}/`, dir), found);
    } else if (/\.(jsx?|tsx?|css)$/.test(name)) {
      found.push(url);
    }
  }
  return found;
}

describe("a failed save offers a recovery that can work", () => {
  it("offers to load the observations again when the retrieval is gone", () => {
    assert.deepEqual(saveFailureAction("retrieval_not_found"), {
      kind: "reload",
      label: "Load observations again",
    });
  });

  it("offers nothing for other failures, which a plain retry may fix", () => {
    for (const code of ["archive_full", "rate_limited", "storage_unavailable", "network_error", null, undefined]) {
      assert.equal(saveFailureAction(code), null, `code ${code}`);
    }
  });
});

describe("the archive is labelled as shared", () => {
  it("says that everyone who uses the server sees the same copies, and that there are no accounts", () => {
    assert.match(ARCHIVE_NOTE, /shared/i);
    assert.match(ARCHIVE_NOTE, /everyone who uses this server/i);
    assert.match(ARCHIVE_NOTE, /no accounts/i);
  });

  it("says that the copies hold only public NOAA data", () => {
    assert.match(ARCHIVE_NOTE, /public NOAA data/i);
  });
});

describe("the return control is named for what it does", () => {
  it("uses 'Return to current session' in the banner and the save panel", () => {
    const banner = readFileSync(new URL("components/SnapshotBanner.jsx", srcRoot), "utf8");
    const panel = readFileSync(new URL("components/SnapshotPanel.jsx", srcRoot), "utf8");
    assert.match(banner, /Return to current session/);
    assert.match(panel, /Return to current session/);
  });

  it("no longer says 'live observations' anywhere in the interface source", () => {
    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8");
      assert.equal(
        /Return to live observations/.test(text),
        false,
        `${file.pathname} still names the control as live observations`
      );
    }
  });
});
