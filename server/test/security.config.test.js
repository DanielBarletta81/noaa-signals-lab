import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ALLOWED_ORIGINS,
  MAX_TRUSTED_PROXY_HOPS,
  resolveAllowedOrigins,
  resolveTrustProxyHops,
} from "../src/config/security.js";

describe("TRUST_PROXY_HOPS", () => {
  it("trusts no proxy when unset, which ignores X-Forwarded-For entirely", () => {
    assert.equal(resolveTrustProxyHops({}), 0);
    assert.equal(resolveTrustProxyHops({ TRUST_PROXY_HOPS: "  " }), 0);
  });

  it("accepts the number of proxies the operator runs, from 0 to the stated maximum", () => {
    assert.equal(resolveTrustProxyHops({ TRUST_PROXY_HOPS: "1" }), 1);
    assert.equal(resolveTrustProxyHops({ TRUST_PROXY_HOPS: String(MAX_TRUSTED_PROXY_HOPS) }), MAX_TRUSTED_PROXY_HOPS);
  });

  it("refuses anything else at startup, rather than trusting an address it cannot account for", () => {
    for (const value of ["true", "-1", "1.5", "1e1", "10", "all", "*"]) {
      assert.throws(() => resolveTrustProxyHops({ TRUST_PROXY_HOPS: value }), /TRUST_PROXY_HOPS/, `value ${value}`);
    }
  });
});

describe("CORS_ALLOWED_ORIGINS", () => {
  it("allows the local Vite development and preview origins when unset", () => {
    assert.deepEqual(resolveAllowedOrigins({}), [...DEFAULT_ALLOWED_ORIGINS]);
    assert.ok(DEFAULT_ALLOWED_ORIGINS.includes("http://localhost:5173"));
    assert.ok(DEFAULT_ALLOWED_ORIGINS.includes("http://localhost:4173"));
  });

  it("accepts a list of exact origins, including an https production origin", () => {
    assert.deepEqual(
      resolveAllowedOrigins({ CORS_ALLOWED_ORIGINS: "https://noaa.example.org, http://localhost:5173" }),
      ["https://noaa.example.org", "http://localhost:5173"]
    );
  });

  it("refuses an entry that is not an origin: a path, a slash, a wildcard, or a non-URL", () => {
    for (const value of [
      "https://noaa.example.org/",
      "https://noaa.example.org/app",
      "*",
      "noaa.example.org",
      "https://noaa.example.org?x=1",
    ]) {
      assert.throws(() => resolveAllowedOrigins({ CORS_ALLOWED_ORIGINS: value }), /CORS_ALLOWED_ORIGINS/, value);
    }
  });

  it("refuses plain http for any host except localhost", () => {
    assert.throws(
      () => resolveAllowedOrigins({ CORS_ALLOWED_ORIGINS: "http://noaa.example.org" }),
      /must use https/
    );
  });

  it("refuses an empty entry, such as a trailing comma", () => {
    assert.throws(() => resolveAllowedOrigins({ CORS_ALLOWED_ORIGINS: "https://a.example.org," }), /empty entry/);
  });
});
