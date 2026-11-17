// Startup configuration. Every explicitly supplied setting is checked, an unset or blank
// setting uses its documented default, and an invalid value stops the server before it
// opens the database or listens on a port.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DEFAULT_ALLOWED_ORIGINS } from "../src/config/security.js";
import { DEFAULT_MAX_SNAPSHOTS, DEFAULT_SNAPSHOT_DB_PATH } from "../src/config/storage.js";
import { DEFAULT_PORT, readServerConfig } from "../src/config/env.js";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("readServerConfig: documented defaults when nothing is set", () => {
  it("returns every default", () => {
    const config = readServerConfig({});
    assert.equal(config.port, DEFAULT_PORT);
    assert.equal(config.port, 4200);
    assert.equal(config.databasePath, DEFAULT_SNAPSHOT_DB_PATH);
    assert.equal(config.maxSnapshots, DEFAULT_MAX_SNAPSHOTS);
    assert.equal(config.trustProxyHops, 0);
    assert.deepEqual(config.allowedOrigins, [...DEFAULT_ALLOWED_ORIGINS]);
    assert.equal(config.noaaTimeoutMs, 8000);
  });

  it("treats blank values as unset, so a template with empty entries still starts with defaults", () => {
    const config = readServerConfig({
      PORT: "  ",
      SNAPSHOT_DB_PATH: "",
      SNAPSHOT_MAX_COUNT: " ",
      TRUST_PROXY_HOPS: "",
      CORS_ALLOWED_ORIGINS: "",
      NOAA_TIMEOUT_MS: "",
    });
    assert.equal(config.port, 4200);
    assert.equal(config.maxSnapshots, 500);
    assert.equal(config.trustProxyHops, 0);
    assert.equal(config.noaaTimeoutMs, 8000);
  });
});

describe("readServerConfig: explicit valid values are used", () => {
  it("reads each setting the operator supplied", () => {
    const config = readServerConfig({
      PORT: "4311",
      SNAPSHOT_MAX_COUNT: "25",
      TRUST_PROXY_HOPS: "1",
      CORS_ALLOWED_ORIGINS: "https://noaa.example.org",
      NOAA_TIMEOUT_MS: "1500",
    });
    assert.equal(config.port, 4311);
    assert.equal(config.maxSnapshots, 25);
    assert.equal(config.trustProxyHops, 1);
    assert.deepEqual(config.allowedOrigins, ["https://noaa.example.org"]);
    assert.equal(config.noaaTimeoutMs, 1500);
  });
});

describe("readServerConfig: an explicit invalid value throws, naming the setting", () => {
  const cases = [
    ["PORT", "0"],
    ["PORT", "70000"],
    ["PORT", "http"],
    ["PORT", "80.5"],
    ["SNAPSHOT_MAX_COUNT", "0"],
    ["SNAPSHOT_MAX_COUNT", "1e3"],
    ["SNAPSHOT_MAX_COUNT", "many"],
    ["NOAA_TIMEOUT_MS", "0"],
    ["NOAA_TIMEOUT_MS", "600000"],
    ["NOAA_TIMEOUT_MS", "soon"],
    ["TRUST_PROXY_HOPS", "true"],
    ["TRUST_PROXY_HOPS", "10"],
    ["CORS_ALLOWED_ORIGINS", "*"],
    ["CORS_ALLOWED_ORIGINS", "https://noaa.example.org/app"],
    ["CORS_ALLOWED_ORIGINS", "http://noaa.example.org"],
  ];
  for (const [name, value] of cases) {
    it(`${name}=${JSON.stringify(value)}`, () => {
      assert.throws(() => readServerConfig({ [name]: value }), new RegExp(name));
    });
  }
});

describe("the server refuses to start with an invalid setting", () => {
  it("exits non-zero before opening the database or listening", async () => {
    const dbPath = path.join(os.tmpdir(), `noaa-config-${randomUUID()}.sqlite`);
    const child = spawn(process.execPath, ["src/index.js"], {
      cwd: SERVER_ROOT,
      env: { ...process.env, SNAPSHOT_MAX_COUNT: "abc", SNAPSHOT_DB_PATH: dbPath, PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const code = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve("timeout");
      }, 10000);
      child.once("exit", (exitCode) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });

    assert.equal(code, 1, `exit code (stderr: ${stderr})`);
    assert.match(stderr, /Configuration error: PORT must be a whole number/);
    assert.match(stderr, /SNAPSHOT_MAX_COUNT must be a whole number/, "every problem is reported in one start");
    assert.equal(/running at/.test(stdout), false, "the server must not start listening");
    assert.equal(existsSync(dbPath), false, "the database must not be created");
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
    }
  });
});
