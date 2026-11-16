// Browser origin policy.
//
// A request that carries an Origin header came from a web page. Only origins on the
// allowlist get Access-Control-Allow-Origin, so a page on any other site cannot read
// responses. Requests with no Origin header (curl, server-to-server calls, same-origin
// navigation in some browsers) are not affected, because CORS is a browser rule.
//
// This is not authentication. Any program can send any Origin header, and the allowlist
// does not identify who is calling. It limits which web pages a browser will let read
// responses, and it lets the server refuse writes from browser pages on other sites.

export function createOriginPolicy(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  // Sets the CORS headers for an allowed origin, and answers preflight requests.
  function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;
    res.vary("Origin");
    if (origin !== undefined && allowed.has(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Accept");
      res.set("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      // A preflight from a disallowed origin gets no CORS headers, so the browser refuses.
      res.status(204).end();
      return;
    }
    next();
  }

  // True when a write may proceed: no Origin (not a browser page), or an allowed one.
  function isWriteAllowed(req) {
    const origin = req.headers.origin;
    return origin === undefined || allowed.has(origin);
  }

  return { corsMiddleware, isWriteAllowed, allowedOrigins: [...allowed] };
}
