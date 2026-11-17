// Starts and stops the real server process for restart tests. The server reads
// SNAPSHOT_DB_PATH and PORT from its environment, as in production.

import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PRELOAD_NOAA_FIXTURE = fileURLToPath(new URL("./mockNoaaPreload.mjs", import.meta.url));

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Resolves once the server prints its "running at" line. Rejects if it exits first.
export function startServer(databasePath, port, { preload = null } = {}) {
  return new Promise((resolve, reject) => {
    const args = [];
    if (preload) args.push("--import", pathToFileURL(preload).href);
    args.push("src/index.js");
    const child = spawn(process.execPath, args, {
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

// A clean shutdown (SIGINT), which closes the database.
export function stopServer(child) {
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGINT");
  });
}

// No shutdown at all, as after a crash or a power loss.
export function killServer(child) {
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGKILL");
  });
}

export function tempDatabaseFile() {
  return path.join(os.tmpdir(), `noaa-restart-${randomUUID()}.sqlite`);
}

export function removeDatabaseFiles(file) {
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(file + suffix)) rmSync(file + suffix);
  }
}
