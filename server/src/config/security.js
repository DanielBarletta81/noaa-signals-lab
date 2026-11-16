// Deployment-facing security settings: which browser origins may call the API, and how
// many reverse proxies sit in front of this server. Both are read from the operator's
// environment and never from a request. Invalid values stop the server at startup,
// because a silent fallback here could hide a misconfigured deployment.
//
// Neither setting is authentication. CORS controls which web pages a browser lets read
// responses. An Origin check on writes stops an ordinary browser on another site from
// writing; it does not stop curl or any other program from doing the same.

// Local development: the Vite dev server (5173) and Vite preview (4173) on localhost.
export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const MAX_TRUSTED_PROXY_HOPS = 2;

// TRUST_PROXY_HOPS: how many reverse proxies you operate in front of this server, each of
// which appends the address it received to X-Forwarded-For. 0 (the default) means the
// server is reached directly, and X-Forwarded-For is ignored entirely. Set 1 only when
// exactly one proxy you control sits in front of this server. Any other value would let
// a client choose the address that rate limits are keyed on.
export function resolveTrustProxyHops(env = process.env) {
  const raw = typeof env.TRUST_PROXY_HOPS === "string" ? env.TRUST_PROXY_HOPS.trim() : "";
  if (raw === "") return 0;
  if (!/^\d+$/.test(raw) || Number(raw) > MAX_TRUSTED_PROXY_HOPS) {
    throw new Error(
      `TRUST_PROXY_HOPS must be a whole number from 0 to ${MAX_TRUSTED_PROXY_HOPS}; got "${raw}".`
    );
  }
  return Number(raw);
}

// CORS_ALLOWED_ORIGINS: a comma-separated list of exact origins, such as
// https://noaa.example.org. An origin has a scheme, host, and optional port, and no path,
// query, or trailing slash. Plain http is accepted only for localhost. Unset means the
// local development origins above.
export function resolveAllowedOrigins(env = process.env) {
  const raw = typeof env.CORS_ALLOWED_ORIGINS === "string" ? env.CORS_ALLOWED_ORIGINS.trim() : "";
  if (raw === "") return [...DEFAULT_ALLOWED_ORIGINS];

  const origins = raw.split(",").map((item) => item.trim());
  for (const origin of origins) {
    if (origin === "") throw new Error("CORS_ALLOWED_ORIGINS contains an empty entry.");
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS_ALLOWED_ORIGINS entry is not a URL: "${origin}".`);
    }
    if (url.origin !== origin) {
      throw new Error(
        `CORS_ALLOWED_ORIGINS entry must be an origin only (scheme, host, port; no path or slash): "${origin}".`
      );
    }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
      throw new Error(`CORS_ALLOWED_ORIGINS entry must use https, except for localhost: "${origin}".`);
    }
  }
  return [...new Set(origins)];
}
