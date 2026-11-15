// Starts the real server process twice against one database file. A snapshot saved
// before the first stop must still be listed after the second start.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSnapshot, saveSnapshot } from "../src/snapshots/repository.js";
import { buildBody, GMT_24, openTempDb } from "./helpers/snapshotFixtures.js";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realFetch = globalThis.fetch;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function startServer(databasePath, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/index.js"], {
      cwd: SERVER_ROOT,
      env: { ...process.env, PORT: String(port), SNAPSHOT_DB_PATH: databasePath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timer = setTimeout(() => reject(new Error(`server did not start: ${output}`)), 10000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("running at")) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on("data", (chunk) => (output += chunk));
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}: ${output}`));
    });
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGINT");
  });
}

describe("persistence across backend restarts", () => {
  it("keeps a saved snapshot after the server process stops and starts again", async () => {
    const temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    // Save with the repository directly. Live NOAA is not needed to test persistence.
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    temp.db.close();

    const port = await freePort();
    const first = await startServer(temp.file, port);
    const listedFirst = await realFetch(`http://127.0.0.1:${port}/api/snapshots`).then((r) => r.json());
    assert.equal(listedFirst.snapshots.some((s) => s.id === id), true);
    await stopServer(first);

    const second = await startServer(temp.file, port);
    const reopened = await realFetch(`http://127.0.0.1:${port}/api/snapshots/${id}`).then((r) => r.json());
    await stopServer(second);

    assert.equal(reopened.ok, true);
    assert.deepEqual(reopened.signal, body);

    temp.cleanup();
  });

  it("reads back the same rows from the file after a close and reopen", async () => {
    const temp = openTempDb();
    const { body, points } = buildBody(GMT_24);
    const id = saveSnapshot(temp.db, { body, points, sourceMode: "live" });
    temp.db.close();
    const { openDatabase } = await import("../src/db/connection.js");
    const reopenedDb = openDatabase(temp.file);
    assert.deepEqual(getSnapshot(reopenedDb, id).body, body);
    reopenedDb.close();
    temp.cleanup();
  });
});
